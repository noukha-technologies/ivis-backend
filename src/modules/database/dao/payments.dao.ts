import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

import { Payments } from '../entity/payments.entity';
import { IPaymentsDao } from '../../transactions/payments/dao/payment.dao.interface';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../common/interfaces/pagination.interface';
import { PaginationService } from '../../../common/shared/pagination/pagination.service';
import {
  buildTypeOrmPaginationOptions,
  toPaginatedResult,
} from '../../../common/shared/pagination/pagination-query.util';

@Injectable()
export class PaymentsDao extends Repository<Payments> implements IPaymentsDao {
  private static readonly detailRelations = {
    appointment: true,
    customer: { vehicleRecord: true },
    vehicleRecord: { vehicleMaster: true },
    job: true,
    anprCapture: true,
    centre: true,
    line: true,
    camera: true,
    paymentType: true,
  } as const;

  constructor(
    private readonly dataSource: DataSource,
    private readonly paginationService: PaginationService,
  ) {
    super(Payments, dataSource.createEntityManager());
  }

  async findActiveById(id: string): Promise<Payments | null> {
    return this.findOne({
      where: { id, is_deleted: false },
      relations: PaymentsDao.detailRelations,
    });
  }

  async findByPaymentsId(paymentsId: number): Promise<Payments | null> {
    return this.findOne({
      where: { payment_id: paymentsId, is_deleted: false },
      relations: PaymentsDao.detailRelations,
    });
  }

  async findPaginated(query: PaginationQueryDto): Promise<PaginatedResult<Payments>> {
    const qb = this.createQueryBuilder('payment')
      .leftJoinAndSelect('payment.customer', 'customer')
      .leftJoinAndSelect('payment.vehicleRecord', 'vehicleRecord')
      .leftJoinAndSelect('payment.appointment', 'appointment')
      .leftJoinAndSelect('payment.paymentType', 'paymentType')
      .leftJoinAndSelect('payment.job', 'job');

    const options = buildTypeOrmPaginationOptions<Payments, Payments>(
      query,
      {
        searchFields: ['status', 'paymentType.name', 'customer.owner_name'],
        allowedSortFields: ['payment_id', 'status', 'pay_date', 'grand_total', 'created_at'],
        defaultSort: { created_at: 'DESC' },
        baseWhere: { is_deleted: false },
      },
    );

    const response = await this.paginationService.paginateQueryBuilder(qb, 'payment', options);
    return toPaginatedResult(response);
  }

  async getNextPaymentsId(): Promise<number> {
    const result = await this.createQueryBuilder('payment')
      .select('MAX(payment.payment_id)', 'max')
      .getRawOne();
    const max = result?.max ? Number(result.max) : 0;
    return max + 1;
  }
}
