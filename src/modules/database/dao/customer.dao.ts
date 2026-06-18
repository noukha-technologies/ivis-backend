import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../common/interfaces/pagination.interface';
import {
  buildTypeOrmPaginationOptions,
  toPaginatedResult,
} from '../../../common/shared/pagination/pagination-query.util';
import { PaginationService } from '../../../common/shared/pagination/pagination.service';
import { ICustomerDao } from '../../transactions/customers/dao/customer.dao.interface';
import { Customer } from '../entity/customer.entity';

@Injectable()
export class CustomerDao extends Repository<Customer> implements ICustomerDao {
  constructor(
    private readonly dataSource: DataSource,
    private readonly paginationService: PaginationService,
  ) {
    super(Customer, dataSource.createEntityManager());
  }

  async findActiveById(id: string): Promise<Customer | null> {
    return this.findOne({
      where: { id, is_deleted: false },
      relations: { primaryVehicleRecord: { vehicleMaster: true } },
    });
  }

  async findByCustomerId(customerId: number): Promise<Customer | null> {
    return this.findOne({
      where: { customer_id: customerId, is_deleted: false },
      relations: { primaryVehicleRecord: { vehicleMaster: true } },
    });
  }

  async findActiveByPhone(phone: string): Promise<Customer | null> {
    return this.findOne({
      where: { phone, is_deleted: false },
      relations: { primaryVehicleRecord: { vehicleMaster: true } },
    });
  }

  async findPaginated(query: PaginationQueryDto): Promise<PaginatedResult<Customer>> {
    const qb = this.createQueryBuilder('customer').leftJoinAndSelect(
      'customer.primaryVehicleRecord',
      'vehicleRecord',
    );

    const options = buildTypeOrmPaginationOptions<Customer, Customer>(query, {
      searchFields: [
        'name',
        'phone',
        'id_number',
        'owner_name',
        'chassis_no',
        'mulkiya_id',
        'vehicleRecord.plate_number',
      ],
      allowedSortFields: [
        'customer_id',
        'name',
        'phone',
        'id_number',
        'chassis_no',
        'mulkiya_id',
        'created_at',
        'updated_at',
      ],
      defaultSort: { created_at: 'DESC' },
      baseWhere: { is_deleted: false },
    });

    const response = await this.paginationService.paginateQueryBuilder(qb, 'customer', options);
    return toPaginatedResult(response);
  }

  async getNextCustomerId(): Promise<number> {
    const result = await this.createQueryBuilder('customer')
      .select('MAX(customer.customer_id)', 'max')
      .getRawOne();
    const max = result?.max ? Number(result.max) : 0;
    return max + 1;
  }
}
