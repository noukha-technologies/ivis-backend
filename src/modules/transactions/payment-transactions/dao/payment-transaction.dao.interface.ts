import { DeepPartial } from 'typeorm';
import { PaginationQueryDto } from '../../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../../common/interfaces/pagination.interface';
import { PaymentTransaction } from '../../../database/entity/payment-transaction.entity';

export interface IPaymentTransactionDao {
  create(entityLike: DeepPartial<PaymentTransaction>): PaymentTransaction;
  save(entity: PaymentTransaction): Promise<PaymentTransaction>;
  merge(entity: PaymentTransaction, entityLike: DeepPartial<PaymentTransaction>): PaymentTransaction;
  findActiveById(id: string): Promise<PaymentTransaction | null>;
  findByPaymentTransactionId(paymentTransactionId: number): Promise<PaymentTransaction | null>;
  findPaginated(query: PaginationQueryDto): Promise<PaginatedResult<PaymentTransaction>>;
  getNextPaymentTransactionId(): Promise<number>;
}
