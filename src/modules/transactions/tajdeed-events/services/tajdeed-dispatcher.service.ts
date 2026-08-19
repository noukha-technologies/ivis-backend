import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { AppLogger } from '../../../../common/logger/app.logger';
import {
  TajdeedDeliveryStatus,
  TajdeedEventStatus,
} from '../../../../common/enums/common.enums';
import { TajdeedOutboxDao } from '../../../database/dao/tajdeed-outbox.dao';
import { TajdeedOutbox } from '../../../database/entity/tajdeed-outbox.entity';
import { AppointmentApiClientService } from '../../../../common/integrations/appointments/appointment-api-client.service';
import {
  RECONCILE_BATCH_LIMIT,
  nextRetryDelayMs,
} from '../../../../common/integrations/appointments/appointment.constants';
import {
  InspectionResultPayload,
  LaneStatusPayload,
  TajdeedEventEnvelope,
} from '../../../../common/integrations/appointments/appointment.types';
import { isCentreNode } from '../../../../common/config/env.config';

/** How often the outbox is drained. */
const DRAIN_INTERVAL_MS = 30_000;

/**
 * Status sweep cadence. Slower than the drain because it answers "did their
 * worker apply it", which resolves in seconds but is not urgent for us.
 */
const CONFIRM_INTERVAL_MS = 2 * 60_000;

/** Rows handled per drain tick — bounds one cycle's provider load. */
const DRAIN_BATCH = 20;

/**
 * Attempts before an event is parked as Abandoned. At the settled 5-minute
 * backoff this is roughly an hour of trying, after which a still-failing push
 * is an outage or a bug, and quietly retrying forever would only hide it.
 */
const MAX_ATTEMPTS = 12;

/**
 * Drains the outbox and reconciles the results.
 *
 * Delivery and processing are two separate questions, so this runs two loops:
 * `drain` gets events to the provider, `confirm` finds out what they did with
 * them. A 202 only means queued, so without the second loop a rejected result
 * would look delivered forever.
 *
 * Disable with `TAJDEED_PUSH_DISABLED=true`.
 */
@Injectable()
export class TajdeedDispatcherService {
  private static readonly context = 'TajdeedDispatcherService';

  constructor(
    private readonly outboxDao: TajdeedOutboxDao,
    private readonly appointmentApi: AppointmentApiClientService,
    private readonly logger: AppLogger,
  ) {}

  @Interval(DRAIN_INTERVAL_MS)
  async drain(): Promise<void> {
    // Centre-only workload — see isCentreNode(). Central serves the same
    // controllers but owns no cameras, no FTP shares and no provider branch.
    if (!isCentreNode()) return;

    if (process.env.TAJDEED_PUSH_DISABLED === 'true') return;

    try {
      const due = await this.outboxDao.findDueForSend(DRAIN_BATCH);
      for (const row of due) {
        await this.send(row);
      }
    } catch (err) {
      // A scheduled job must never throw: an outage cannot be allowed to take
      // the interval itself down, or delivery stops until the next restart.
      this.logger.warn(
        `Outbox drain cycle failed: ${(err as Error).message}`,
        TajdeedDispatcherService.context,
      );
    }
  }

  private async send(row: TajdeedOutbox): Promise<void> {
    // Claim first, so a second instance draining concurrently cannot send the
    // same row twice. Losing the claim means someone else has it.
    const backoff = nextRetryDelayMs(row.attempt_count + 1);
    const claimed = await this.outboxDao.claimForSend(
      row.id,
      new Date(Date.now() + backoff),
    );
    if (!claimed) return;

    const envelope: TajdeedEventEnvelope = {
      event_type: row.event_type,
      transaction_id: row.transaction_id,
      branch_code: row.branch_code,
      timestamp: new Date().toISOString(),
      payload: row.payload as unknown as
        | InspectionResultPayload
        | LaneStatusPayload,
    };

    const outcome = await this.appointmentApi.pushEvent(envelope);

    if (outcome.ok) {
      await this.outboxDao.update(row.id, {
        delivery_status: TajdeedDeliveryStatus.ACCEPTED,
        accepted_at: new Date(),
        next_attempt_at: null,
        last_error: null,
      });
      this.logger.log(
        `Delivered ${row.event_type} ${row.transaction_id}${outcome.duplicate ? ' (already held by provider)' : ''}`,
        TajdeedDispatcherService.context,
      );
      return;
    }

    if (!outcome.retryable) {
      // A 4xx will answer identically until the payload or credential changes,
      // so retrying is pure noise. Park it for a human.
      await this.outboxDao.update(row.id, {
        delivery_status: TajdeedDeliveryStatus.ABANDONED,
        next_attempt_at: null,
        last_error: outcome.reason,
      });
      this.logger.error(
        `Abandoned ${row.event_type} ${row.transaction_id}: ${outcome.reason}`,
        undefined,
        TajdeedDispatcherService.context,
      );
      return;
    }

    const attempts = row.attempt_count + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await this.outboxDao.update(row.id, {
        delivery_status: TajdeedDeliveryStatus.ABANDONED,
        next_attempt_at: null,
        last_error: `Gave up after ${attempts} attempts. Last error: ${outcome.reason}`,
      });
      this.logger.error(
        `Abandoned ${row.event_type} ${row.transaction_id} after ${attempts} attempts: ${outcome.reason}`,
        undefined,
        TajdeedDispatcherService.context,
      );
      return;
    }

    // Stays Pending; claimForSend already moved next_attempt_at out by the
    // backoff, so it simply becomes due again later.
    await this.outboxDao.update(row.id, { last_error: outcome.reason });
    this.logger.warn(
      `Retrying ${row.event_type} ${row.transaction_id} (attempt ${attempts}): ${outcome.reason}`,
      TajdeedDispatcherService.context,
    );
  }

  /** Asks the provider what became of everything we have delivered. */
  @Interval(CONFIRM_INTERVAL_MS)
  async confirm(): Promise<void> {
    // Centre-only workload — see isCentreNode(). Central serves the same
    // controllers but owns no cameras, no FTP shares and no provider branch.
    if (!isCentreNode()) return;

    if (process.env.TAJDEED_PUSH_DISABLED === 'true') return;

    try {
      const pending = await this.outboxDao.findAwaitingConfirmation(
        RECONCILE_BATCH_LIMIT,
      );
      if (pending.length === 0) return;

      const byTransaction = new Map(pending.map((r) => [r.transaction_id, r]));
      const results = await this.appointmentApi.reconcile([
        ...byTransaction.keys(),
      ]);
      if (!results) return; // call failed — leave every row as it was

      for (const result of results) {
        const row = byTransaction.get(result.transaction_id);
        if (row) await this.applyStatus(row, result.event_status);
      }
    } catch (err) {
      this.logger.warn(
        `Outbox confirm cycle failed: ${(err as Error).message}`,
        TajdeedDispatcherService.context,
      );
    }
  }

  private async applyStatus(
    row: TajdeedOutbox,
    rawStatus: string,
  ): Promise<void> {
    // The provider sends a bare string; narrow it once here so the branches
    // below compare enum to enum rather than guessing at each site.
    const eventStatus = rawStatus as TajdeedEventStatus;

    if (eventStatus === TajdeedEventStatus.PROCESSED) {
      await this.outboxDao.update(row.id, {
        delivery_status: TajdeedDeliveryStatus.PROCESSED,
        event_status: TajdeedEventStatus.PROCESSED,
        processed_at: new Date(),
      });
      this.logger.log(
        `Provider processed ${row.event_type} ${row.transaction_id}`,
        TajdeedDispatcherService.context,
      );
      return;
    }

    if (eventStatus === TajdeedEventStatus.FAILED) {
      // Terminal on their side and never self-healing. Recorded loudly, and
      // left for an operator: correcting it means a NEW transaction id, which
      // is a deliberate decision rather than something to automate.
      const detail = await this.appointmentApi.fetchEventStatus(
        row.transaction_id,
      );
      await this.outboxDao.update(row.id, {
        delivery_status: TajdeedDeliveryStatus.FAILED,
        event_status: TajdeedEventStatus.FAILED,
        last_error: detail?.error_message ?? 'Provider rejected the event',
      });
      this.logger.error(
        `Provider REJECTED ${row.event_type} ${row.transaction_id}: ${detail?.error_message ?? 'no reason given'}`,
        undefined,
        TajdeedDispatcherService.context,
      );
      return;
    }

    if (eventStatus === TajdeedEventStatus.NOT_FOUND) {
      // They hold no such event, so our "accepted" was wrong — the safe answer
      // is to send it again under the SAME id, which is exactly what the
      // provider's guidance says NOT_FOUND licenses.
      await this.outboxDao.update(row.id, {
        delivery_status: TajdeedDeliveryStatus.PENDING,
        event_status: TajdeedEventStatus.NOT_FOUND,
        accepted_at: null,
        next_attempt_at: new Date(),
      });
      this.logger.warn(
        `Provider has no record of ${row.transaction_id} — re-queued for delivery`,
        TajdeedDispatcherService.context,
      );
      return;
    }

    // RECEIVED / PROCESSING — still in flight, ask again next sweep.
    await this.outboxDao.update(row.id, { event_status: eventStatus });
  }
}
