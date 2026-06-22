import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../common/interfaces/pagination.interface';
import {
  buildTypeOrmPaginationOptions,
  toPaginatedResult,
} from '../../../common/shared/pagination/pagination-query.util';
import { PaginationService } from '../../../common/shared/pagination/pagination.service';
import { IPaymentTypeDao } from '../../masters/payment-type/dao/payment-type.dao.interface';
import { PaymentType } from '../entity/payment-type.entity';

@Injectable()
export class PaymentTypeDao extends Repository<PaymentType> implements IPaymentTypeDao {
  constructor(
    private readonly dataSource: DataSource,
    private readonly paginationService: PaginationService,
  ) {
    super(PaymentType, dataSource.createEntityManager());
  }

  async findActiveById(id: string): Promise<PaymentType | null> {
    return this.findOne({ where: { id, is_deleted: false } });
  }

  async findByCode(code: string): Promise<PaymentType | null> {
    return this.findOne({ where: { code, is_deleted: false } });
  }

  async findPaginated(query: PaginationQueryDto): Promise<PaginatedResult<PaymentType>> {
    const qb = this.createQueryBuilder('pt')
      .where('pt.is_deleted = :is_deleted', { is_deleted: false });

    const options = buildTypeOrmPaginationOptions<PaymentType, PaymentType>(query, {
      searchFields: ['pt.name', 'pt.code', 'pt.status'],
      allowedSortFields: ['payment_type_id', 'name', 'code', 'status', 'created_at'],
      defaultSort: { created_at: 'DESC' },
    });

    const response = await this.paginationService.paginateQueryBuilder(qb, 'pt', options);
    return toPaginatedResult(response);
  }

  async getNextPaymentTypeId(): Promise<number> {
    const result = await this.createQueryBuilder('pt')
      .select('MAX(pt.payment_type_id)', 'max')
      .getRawOne();
    const max = result?.max ? Number(result.max) : 0;
    return max + 1;
  }
}
