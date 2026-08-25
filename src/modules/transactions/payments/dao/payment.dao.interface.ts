import { DeepPartial } from 'typeorm';
import { Payments } from '../../../database/entity/payments.entity';
import { PaginationQueryDto } from '../../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../../common/interfaces/pagination.interface';

export interface IPaymentsDao {
  create(entityLike: DeepPartial<Payments>): Payments;
  save(entity: Payments): Promise<Payments>;
  merge(entity: Payments, entityLike: DeepPartial<Payments>): Payments;
  findActiveById(id: string): Promise<Payments | null>;
  findByPaymentsId(paymentsId: number): Promise<Payments | null>;
  findByJobId(jobId: string): Promise<Payments | null>;

  /** Everything settled against a job (Cancelled excluded), oldest first. */
  findSettledByJobId(jobId: string): Promise<Payments[]>;
  findPaginated(query: PaginationQueryDto): Promise<PaginatedResult<Payments>>;
  getNextPaymentsId(): Promise<number>;
}
