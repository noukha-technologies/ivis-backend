import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AppLogger } from '../../../../common/logger/app.logger';
import { generateSnowflakeId } from '../../../../common/shared/snowflakeIdGeneration';
import {
  TajdeedDeliveryStatus,
  TajdeedEventType,
} from '../../../../common/enums/common.enums';
import { TajdeedOutboxDao } from '../../../database/dao/tajdeed-outbox.dao';
import { TajdeedOutbox } from '../../../database/entity/tajdeed-outbox.entity';
import {
  InspectionResultPayload,
  LaneStatusPayload,
} from '../../../../common/integrations/appointments/appointment.types';
import { isBranchWritable } from '../../../../common/integrations/appointments/appointment.constants';

export interface EnqueueInput {
  eventType: TajdeedEventType;
  branchCode: string;
  payload: InspectionResultPayload | LaneStatusPayload;
  jobId?: string | null;
  centreId?: string | null;
  lineId?: string | null;
}

/**
 * Writes events into the outbox. Enqueueing only — nothing here talks to the
 * provider, so a provider outage can never fail the operator action that
 * raised the event.
 */
@Injectable()
export class TajdeedOutboxService {
  private static readonly context = 'TajdeedOutboxService';

  constructor(
    private readonly outboxDao: TajdeedOutboxDao,
    private readonly logger: AppLogger,
  ) {}

  /**
   * Queues one event, or returns null when it must not be sent.
   *
   * The transaction_id is minted and persisted HERE, before any send, because
   * reusing it is what makes a retry safe: the provider accepts an id exactly
   * once, so a resend after a timeout settles as a duplicate rather than
   * double-recording an inspection.
   */
  async enqueue(input: EnqueueInput): Promise<TajdeedOutbox | null> {
    const branchCode = input.branchCode.trim().toUpperCase();

    // MSC, SEB and SHR are live queues even on the staging host, so a push
    // from a dev box would inject fabricated results into a real branch's
    // work. Outside production only the isolated SBX branch accepts writes.
    if (!isBranchWritable(branchCode)) {
      this.logger.warn(
        `Refusing to queue ${input.eventType} for branch ${branchCode}: writes to live branches are blocked outside production`,
        TajdeedOutboxService.context,
      );
      return null;
    }

    // One inspection result per job. The provider completes the booking on the
    // first one, so a second is at best a duplicate and at worst attributes a
    // different result to a booking that has already been closed out.
    //
    // Scoped to INSPECTION_RESULT on purpose: a job legitimately raises TWO
    // lane events (OCCUPIED at start, IDLE at finish), so guarding those the
    // same way would make the second one silently return the first instead of
    // queueing. They still carry job_id, so every event a job produced stays
    // traceable to it.
    if (input.jobId && input.eventType === TajdeedEventType.INSPECTION_RESULT) {
      const existing = await this.outboxDao.findByJobAndType(
        input.jobId,
        input.eventType,
      );
      if (existing) {
        this.logger.log(
          `${input.eventType} already queued for job ${input.jobId} (${existing.transaction_id}, ${existing.delivery_status}) — not queueing again`,
          TajdeedOutboxService.context,
        );
        return existing;
      }
    }

    const row = await this.outboxDao.save(
      this.outboxDao.create({
        id: generateSnowflakeId(),
        transaction_id: randomUUID(),
        event_type: input.eventType,
        branch_code: branchCode,
        payload: input.payload as unknown as Record<string, unknown>,
        job_id: input.jobId ?? null,
        centre_id: input.centreId ?? null,
        line_id: input.lineId ?? null,
        delivery_status: TajdeedDeliveryStatus.PENDING,
        attempt_count: 0,
        // Due immediately; the drain worker picks it up on its next tick.
        next_attempt_at: new Date(),
      }),
    );

    this.logger.log(
      `Queued ${input.eventType} ${row.transaction_id} for branch ${branchCode}${input.jobId ? ` (job ${input.jobId})` : ''}`,
      TajdeedOutboxService.context,
    );
    return row;
  }

  /**
   * Re-queues a FAILED event as a NEW transaction.
   *
   * Deliberately not a retry of the original: the provider will never move a
   * failed transaction to processed, and re-pushing its id only earns E0007.
   * A fresh id is the only way the corrected event can be applied.
   */
  /**
   * Where a job currently stands with the provider, for the job screen.
   *
   * Returns null when nothing was ever queued — a walk-in, or a job whose
   * booking the provider does not know about. That is a legitimate state, not
   * an error: there is simply nothing to file.
   */
  async latestForJob(jobId: string): Promise<TajdeedOutbox | null> {
    return this.outboxDao.findLatestInspectionResultByJobId(jobId);
  }

  /** True while a job still has an inspection result queued or unconfirmed. */
  async hasLiveResult(jobId: string): Promise<boolean> {
    return this.outboxDao.hasLiveInspectionResult(jobId);
  }

  /** Latest provider state for a page of jobs — see the DAO for why it is batched. */
  async latestForJobs(jobIds: string[]): Promise<TajdeedOutbox[]> {
    return this.outboxDao.findLatestInspectionResultsByJobIds(jobIds);
  }

  /**
   * Operator-driven retry: re-queue a job's most recent rejected result now.
   *
   * Exists because the automatic retry waits 30 minutes, and an operator who
   * has just watched the counter check the customer in should not have to.
   */
  async pushNowForJob(jobId: string): Promise<TajdeedOutbox | null> {
    const latest = await this.latestForJob(jobId);
    if (!latest) return null;

    // Same invariant as the automatic path: never add a second live event for
    // one job. An operator pressing the button twice, or pressing it while a
    // scheduled retry is already waiting, must not create a parallel attempt.
    // Returning the existing row keeps the caller's success path intact.
    if (await this.hasLiveResult(jobId)) {
      this.logger.log(
        `Job ${jobId} already has a result in flight (${latest.transaction_id}) — not queueing another.`,
        TajdeedOutboxService.context,
      );
      return latest;
    }

    return this.repush(latest.transaction_id, new Date());
  }

  /**
   * Clones a rejected event as a fresh one.
   *
   * @param runAt when the successor becomes eligible to send. Defaults to now
   *   for an operator pressing retry; the automatic path passes a future time
   *   so the provider has a chance to record the check-in first.
   */
  async repush(
    transactionId: string,
    runAt: Date = new Date(),
  ): Promise<TajdeedOutbox | null> {
    const original = await this.outboxDao.findByTransactionId(transactionId);
    if (!original) return null;

    const row = await this.outboxDao.save(
      this.outboxDao.create({
        id: generateSnowflakeId(),
        transaction_id: randomUUID(),
        event_type: original.event_type,
        branch_code: original.branch_code,
        payload: original.payload,
        job_id: original.job_id ?? null,
        centre_id: original.centre_id ?? null,
        line_id: original.line_id ?? null,
        delivery_status: TajdeedDeliveryStatus.PENDING,
        attempt_count: 0,
        next_attempt_at: runAt,
      }),
    );

    this.logger.log(
      `Re-pushing ${original.event_type} from ${transactionId} as ${row.transaction_id}`,
      TajdeedOutboxService.context,
    );
    return row;
  }
}
