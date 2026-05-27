import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../common/interfaces/pagination.interface';
import {
  buildTypeOrmPaginationOptions,
  toPaginatedResult,
} from '../../../common/shared/pagination/pagination-query.util';
import { PaginationService } from '../../../common/shared/pagination/pagination.service';
import { Payment } from '../entity/payment.entity';

@Injectable()
export class PaymentDao extends Repository<Payment> {
  constructor(
    private readonly dataSource: DataSource,
    private readonly paginationService: PaginationService,
  ) {
    super(Payment, dataSource.createEntityManager());
  }

  async findActiveById(id: string): Promise<Payment | null> {
    return this.findOne({ where: { id, is_deleted: false } });
  }

  async findByCode(code: string): Promise<Payment | null> {
    return this.findOne({ where: { code, is_deleted: false } });
  }

  async findByPaymentId(paymentId: number): Promise<Payment | null> {
    return this.findOne({ where: { payment_id: paymentId, is_deleted: false } });
  }

  async findPaginated(query: PaginationQueryDto): Promise<PaginatedResult<Payment>> {
    const options = buildTypeOrmPaginationOptions<Payment, Payment>(query, {
      searchFields: ['name', 'code', 'status'],
      allowedSortFields: ['payment_id', 'name', 'code', 'status', 'created_at'],
      defaultSort: { created_at: 'DESC' },
      baseWhere: { is_deleted: false },
    });

    const response = await this.paginationService.paginate(this, 'payment', options);
    return toPaginatedResult(response);
  }

  async getNextId(): Promise<number> {
    const result = await this.createQueryBuilder('pay')
      .select('MAX(pay.payment_id)', 'max')
      .getRawOne();
    return (result?.max ? Number(result.max) : 0) + 1;
  }
}
