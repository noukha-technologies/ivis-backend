import { Injectable } from '@nestjs/common';
import { DataSource, In, IsNull, Repository } from 'typeorm';
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

    findByTransactionId(transactionId: string): Promise<TajdeedOutbox | null> {
    return this.findOne({ where: { transaction_id: transactionId } });
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
