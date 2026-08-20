import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { AppLogger } from '../../../../common/logger/app.logger';
import {
  TajdeedDeliveryStatus,
  TajdeedEventStatus,
  TajdeedEventType,
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
import { isSameOmanDay } from '../../../../common/utils/util';
import { TajdeedOutboxService } from './tajdeed-outbox.service';

/** How often the outbox is drained. */
const DRAIN_INTERVAL_MS = 30_000;

/**
 * Status sweep cadence. Slower than the drain because it answers "did their
 * worker apply it", which resolves in seconds but is not urgent for us.
 */
const CONFIRM_INTERVAL_MS = 2 * 60_000;

/**
 * How long to wait before re-sending a result the provider rejected because
 * the booking was not checked in. Sized for a person at their counter, not for
 * a transient network fault — polling faster would not make anyone arrive
 * sooner.
 */
const REJECTION_RETRY_DELAY_MS = 30 * 60_000;

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
    private readonly outbox: TajdeedOutboxService,
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

/**
   * Only a rejection that can plausibly clear on its own is worth retrying.
   *
   * The provider rejects an INSPECTION_RESULT for several reasons, and most are
   * permanent: wrong branch, wrong day, already completed, ambiguous plate.
   * Retrying those forever is noise. The one that genuinely resolves is the
   * booking not yet being checked in — their counter records the arrival
   * minutes later and the identical payload then succeeds.
   */
  private isRecoverableRejection(reason: string): boolean {
    const text = reason.toLowerCase();
    return (
      text.includes('no active booking') ||
      text.includes('checked_in') ||
      text.includes('not checked in')
    );
  }

  /**
   * Re-queues a rejected inspection result as a fresh event, later.
   *
   * A new transaction id is mandatory — the provider holds the old one and
   * answers E0007 to any resend of it. The delay exists because the thing we
   * are waiting for is a human at their counter, which no amount of immediate
   * retrying will hurry.
   *
   * Bounded by the Oman day the job completed on, which needs no counter and
   * matches the business rule: ROP wants same-day submission and the provider
   * only keeps a booking actionable for its own day, so an event that has not
   * landed by midnight never will.
   */
  private async scheduleRejectionRetry(
    row: TajdeedOutbox,
    reason: string,
  ): Promise<void> {
    if (row.event_type !== TajdeedEventType.INSPECTION_RESULT) return;
    if (!row.job_id) return;

    if (!this.isRecoverableRejection(reason)) {
      this.logger.warn(
        `Not retrying ${row.transaction_id} — "${reason}" will not resolve on its own.`,
        TajdeedDispatcherService.context,
      );
      return;
    }

    if (!isSameOmanDay(new Date(row.created_at), new Date())) {
      this.logger.warn(
        `Not retrying ${row.transaction_id} — past the Oman day it was raised on, so the booking can no longer accept it.`,
        TajdeedDispatcherService.context,
      );
      return;
    }

    // One live event per job. A retry is scheduled per rejected ROW, but what
    // is being retried is the job's result — so two rows rejected in the same
    // confirm sweep would each spawn a successor, both fail, and spawn two
    // more. That doubles every cycle. If anything is still queued or awaiting
    // confirmation for this job, it already covers the retry.
    if (await this.outbox.hasLiveResult(row.job_id)) {
      this.logger.log(
        `Not retrying ${row.transaction_id} — job ${row.job_id} already has a result in flight.`,
        TajdeedDispatcherService.context,
      );
      return;
    }

    const retryAt = new Date(Date.now() + REJECTION_RETRY_DELAY_MS);
    const successor = await this.outbox.repush(row.transaction_id, retryAt);
    if (!successor) return;

    this.logger.log(
      `Queued ${successor.transaction_id} to retry ${row.transaction_id} at ${retryAt.toISOString()} — waiting for the provider to record the check-in.`,
      TajdeedDispatcherService.context,
    );
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
      const detail = await this.appointmentApi.fetchEventStatus(
        row.transaction_id,
      );
      const reason = detail?.error_message ?? 'Provider rejected the event';

      // The original row is always closed as FAILED — a rejected transaction
      // id never becomes processed, and re-sending it only earns E0007. Any
      // recovery is a NEW event, queued below.
      await this.outboxDao.update(row.id, {
        delivery_status: TajdeedDeliveryStatus.FAILED,
        event_status: TajdeedEventStatus.FAILED,
        last_error: reason,
      });
      this.logger.error(
        `Provider REJECTED ${row.event_type} ${row.transaction_id}: ${reason}`,
        undefined,
        TajdeedDispatcherService.context,
      );

      await this.scheduleRejectionRetry(row, reason);
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
