import { Injectable } from '@nestjs/common';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../common/interfaces/pagination.interface';
import {
  buildTypeOrmPaginationOptions,
  toPaginatedResult,
} from '../../../common/shared/pagination/pagination-query.util';
import { PaginationService } from '../../../common/shared/pagination/pagination.service';
import { ITajdeedOutboxDao } from '../../transactions/tajdeed-events/dao/tajdeed-outbox.dao.interface';
import { TajdeedOutbox } from '../entity/tajdeed-outbox.entity';
import {
  TajdeedDeliveryStatus,
  TajdeedEventType,
  TajdeedEventStatus,
} from '../../../common/enums/common.enums';

@Injectable()
export class TajdeedOutboxDao
  extends Repository<TajdeedOutbox>
  implements ITajdeedOutboxDao
{
  /**
   * update() for rows carrying the jsonb response columns.
   *
   * TypeORM's update() signature deep-partials every property, which a jsonb
   * column holding an arbitrary provider body cannot satisfy — the object IS
   * the value, not a partial of one. The cast is confined to this one method
   * rather than repeated at every dispatcher call site.
   */
  async patch(id: string, changes: Partial<TajdeedOutbox>): Promise<void> {
    await this.update(id, changes as QueryDeepPartialEntity<TajdeedOutbox>);
  }

  constructor(
    private readonly dataSource: DataSource,
    private readonly paginationService: PaginationService,
  ) {
    super(TajdeedOutbox, dataSource.createEntityManager());
  }

  /**
   * Pending rows whose backoff has elapsed. A null next_attempt_at means
   * "never attempted", which is due immediately.
   */
  findDueForSend(limit: number): Promise<TajdeedOutbox[]> {
    return this.createQueryBuilder('outbox')
      .where('outbox.delivery_status = :status', {
        status: TajdeedDeliveryStatus.PENDING,
      })
      .andWhere(
        '(outbox.next_attempt_at IS NULL OR outbox.next_attempt_at <= NOW())',
      )
      .orderBy('outbox.created_at', 'ASC')
      .take(limit)
      .getMany();
  }

  /**
   * Delivered but not yet resolved: the provider has the event, and we do not
   * know whether its worker applied it. RECEIVED and PROCESSING are both still
   * in flight, so they stay in the sweep until they reach a terminal answer.
   */
  findAwaitingConfirmation(limit: number): Promise<TajdeedOutbox[]> {
    return this.find({
      where: [
        {
          delivery_status: TajdeedDeliveryStatus.ACCEPTED,
          event_status: IsNull(),
        },
        {
          delivery_status: TajdeedDeliveryStatus.ACCEPTED,
          event_status: In([
            TajdeedEventStatus.RECEIVED,
            TajdeedEventStatus.PROCESSING,
            TajdeedEventStatus.NOT_FOUND,
          ]),
        },
      ],
      order: { accepted_at: 'ASC' },
      take: limit,
    });
  }

  /**
   * The newest inspection-result event raised for a job.
   *
   * A job can have several over its life: one per submit, plus a successor for
   * every automatic or manual retry. Only the latest describes where the job
   * currently stands with the provider — the earlier ones are the audit trail.
   */
  /**
   * Does this job already have an inspection result that is still going to be
   * tried — queued, or delivered but unconfirmed?
   *
   * The guard against fan-out. A retry is scheduled per REJECTED ROW, but the
   * thing being retried is the JOB's result. Two rejected rows in one confirm
   * sweep therefore used to spawn two successors, which both failed and spawned
   * two more — doubling every cycle until the day rolled over. One live event
   * per job is the invariant; anything else is duplicate work the provider
   * would have to reject anyway.
   */
  async hasLiveInspectionResult(jobId: string): Promise<boolean> {
    const count = await this.createQueryBuilder('outbox')
      .where('outbox.job_id = :jobId', { jobId })
      .andWhere('outbox.event_type = :type', {
        type: TajdeedEventType.INSPECTION_RESULT,
      })
      .andWhere('outbox.delivery_status IN (:...live)', {
        live: [TajdeedDeliveryStatus.PENDING, TajdeedDeliveryStatus.ACCEPTED],
      })
      .getCount();
    return count > 0;
  }

  findLatestInspectionResultByJobId(
    jobId: string,
  ): Promise<TajdeedOutbox | null> {
    return this.createQueryBuilder('outbox')
      .where('outbox.job_id = :jobId', { jobId })
      .andWhere('outbox.event_type = :type', {
        type: TajdeedEventType.INSPECTION_RESULT,
      })
      .orderBy('outbox.created_at', 'DESC')
      .getOne();
  }

  /**
   * Latest inspection-result event for each of several jobs, in one query.
   *
   * DISTINCT ON keeps only the newest row per job — the job list needs the
   * current state of a whole page at once, and asking per row would be one
   * request per job on every render.
   */
  findLatestInspectionResultsByJobIds(
    jobIds: string[],
  ): Promise<TajdeedOutbox[]> {
    if (!jobIds.length) return Promise.resolve([]);
    return this.createQueryBuilder('outbox')
      .distinctOn(['outbox.job_id'])
      .where('outbox.job_id IN (:...jobIds)', { jobIds })
      .andWhere('outbox.event_type = :type', {
        type: TajdeedEventType.INSPECTION_RESULT,
      })
      .orderBy('outbox.job_id', 'ASC')
      .addOrderBy('outbox.created_at', 'DESC')
      .getMany();
  }

  findByTransactionId(transactionId: string): Promise<TajdeedOutbox | null> {
    return this.findOne({ where: { transaction_id: transactionId } });
  }

  /**
   * Every event raised for one provider booking, newest first.
   *
   * The outbox holds no booking reference — events are keyed by job, because
   * that is what raises them — so the booking is reached through the job that
   * was created from its appointment. Joined rather than resolved in three
   * round trips: each hop is an indexed FK, so the whole chain is one query.
   *
   * Two things are legitimately absent from the result. A booking whose
   * vehicle has not arrived has no job, so no events — an empty list, not an
   * error. And the 5-minute lane heartbeat is centre-wide with no job_id at
   * all, so it belongs to no single booking and never appears here; only the
   * per-transition lane events and the inspection result do.
   */
  findByProviderBookingId(bookingId: string): Promise<TajdeedOutbox[]> {
    return this.createQueryBuilder('outbox')
      .innerJoin('outbox.job', 'job')
      .innerJoin('job.appointment', 'appointment')
      .where('appointment.provider_booking_id = :bookingId', { bookingId })
      .orderBy('outbox.created_at', 'DESC')
      .getMany();
  }

  /**
   * The enqueue guard. Abandoned rows are excluded so a payload that was
   * rejected outright can be corrected and re-queued, while a live or already
   * delivered event blocks a second copy.
   */
  findByJobAndType(
    jobId: string,
    eventType: string,
  ): Promise<TajdeedOutbox | null> {
    return this.createQueryBuilder('outbox')
      .where('outbox.job_id = :jobId', { jobId })
      .andWhere('outbox.event_type = :eventType', { eventType })
      .andWhere('outbox.delivery_status != :abandoned', {
        abandoned: TajdeedDeliveryStatus.ABANDONED,
      })
      .orderBy('outbox.created_at', 'DESC')
      .getOne();
  }

  /** Claims a row for this cycle, returning false if another worker took it. */
  async claimForSend(id: string, nextAttemptAt: Date): Promise<boolean> {
    const result = await this.createQueryBuilder()
      .update(TajdeedOutbox)
      .set({
        attempt_count: () => 'attempt_count + 1',
        next_attempt_at: nextAttemptAt,
      })
      .where('id = :id', { id })
      .andWhere('delivery_status = :status', {
        status: TajdeedDeliveryStatus.PENDING,
      })
      .execute();

    return (result.affected ?? 0) > 0;
  }

  async findPaginated(
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<TajdeedOutbox>> {
    const qb = this.createQueryBuilder('outbox')
      .leftJoinAndSelect('outbox.job', 'job')
      .leftJoinAndSelect('outbox.centre', 'centre')
      .leftJoinAndSelect('outbox.line', 'line');

    const options = buildTypeOrmPaginationOptions<TajdeedOutbox, TajdeedOutbox>(
      query,
      {
        searchFields: [
          'transaction_id',
          'event_type',
          'branch_code',
          'delivery_status',
          'event_status',
        ],
        allowedSortFields: [
          'created_at',
          'updated_at',
          'delivery_status',
          'event_type',
          'attempt_count',
        ],
        defaultSort: { created_at: 'DESC' },
      },
    );

    const response = await this.paginationService.paginateQueryBuilder(
      qb,
      'outbox',
      options,
    );
    return toPaginatedResult(response);
  }
}
