import { DeepPartial } from 'typeorm';
import { Payments } from '../../../database/entity/payments.entity';
import { PaginationQueryDto } from '../../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../../common/interfaces/pagination.interface';

export interface IPaymentsDao {
  create(entityLike: DeepPartial<Payments>): Payments;
  save(entity: Payments): Promise<Payments>;
  merge(entity: Payments, entityLike: DeepPartial<Payments>): Payments;
  findActiveById(id: string): Promise<Payments | null>;
  findByPaymentTransactionId(paymentTransactionId: number): Promise<Payments | null>;
  findPaginated(query: PaginationQueryDto): Promise<PaginatedResult<Payments>>;
  getNextPaymentTransactionId(): Promise<number>;
}
