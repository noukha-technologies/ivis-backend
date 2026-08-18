import { PaginationQueryDto } from '../../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../../common/interfaces/pagination.interface';
import { TajdeedOutbox } from '../../../database/entity/tajdeed-outbox.entity';

export interface ITajdeedOutboxDao {
  /** Rows due to be sent now, oldest first, capped for one drain cycle. */
  findDueForSend(limit: number): Promise<TajdeedOutbox[]>;

  /** Accepted rows whose provider outcome is still unknown. */
  findAwaitingConfirmation(limit: number): Promise<TajdeedOutbox[]>;

  findByTransactionId(transactionId: string): Promise<TajdeedOutbox | null>;

  /** Any event already queued for this job — the enqueue idempotency guard. */
  findByJobAndType(
    jobId: string,
    eventType: string,
  ): Promise<TajdeedOutbox | null>;

  findPaginated(
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<TajdeedOutbox>>;
}
