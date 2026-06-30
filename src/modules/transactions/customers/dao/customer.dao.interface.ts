import { DeepPartial } from 'typeorm';
import { PaginationQueryDto } from '../../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../../common/interfaces/pagination.interface';
import { Customer } from '../../../database/entity/customer.entity';

export interface ICustomerDao {
  create(entityLike: DeepPartial<Customer>): Customer;
  save(entity: Customer): Promise<Customer>;
  merge(entity: Customer, entityLike: DeepPartial<Customer>): Customer;
  findActiveById(id: string): Promise<Customer | null>;
  findByCustomerId(customerId: number): Promise<Customer | null>;
  findActiveByPhone(phone: string): Promise<Customer | null>;
  findByVehicleRecordId(vehicleRecordId: string): Promise<Customer | null>;
  findPaginated(query: PaginationQueryDto): Promise<PaginatedResult<Customer>>;
  getNextCustomerId(): Promise<number>;
}
