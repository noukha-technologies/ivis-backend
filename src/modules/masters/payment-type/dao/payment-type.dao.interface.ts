import { PaymentType } from '../../../database/entity/payment-type.entity';
import { PaginationQueryDto } from '../../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../../common/interfaces/pagination.interface';

export interface IPaymentTypeDao {
  findActiveById(id: string): Promise<PaymentType | null>;
  findByCode(code: string): Promise<PaymentType | null>;
  findPaginated(query: PaginationQueryDto): Promise<PaginatedResult<PaymentType>>;
  getNextPaymentTypeId(): Promise<number>;
}
