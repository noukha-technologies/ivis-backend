import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../common/interfaces/pagination.interface';
import {
  buildTypeOrmPaginationOptions,
  toPaginatedResult,
} from '../../../common/shared/pagination/pagination-query.util';
import { PaginationService } from '../../../common/shared/pagination/pagination.service';
import { IPaymentTransactionDao } from '../../transactions/payment-transactions/dao/payment-transaction.dao.interface';
import { PaymentTransaction } from '../entity/payment-transaction.entity';

@Injectable()
export class PaymentTransactionDao
  extends Repository<PaymentTransaction>
  implements IPaymentTransactionDao
{
  private static readonly detailRelations = {
    appointment: true,
    customer: { primaryVehicleRecord: true },
    vehicleRecord: { vehicleMaster: true },
    job: true,
    anprCapture: true,
    centre: true,
    line: true,
    adminPc: true,
    camera: true,
  } as const;

  constructor(
    private readonly dataSource: DataSource,
    private readonly paginationService: PaginationService,
  ) {
    super(PaymentTransaction, dataSource.createEntityManager());
  }

  async findActiveById(id: string): Promise<PaymentTransaction | null> {
    return this.findOne({
      where: { id, is_deleted: false },
      relations: PaymentTransactionDao.detailRelations,
    });
  }

  async findByPaymentTransactionId(
    paymentTransactionId: number,
  ): Promise<PaymentTransaction | null> {
    return this.findOne({
      where: { payment_transaction_id: paymentTransactionId, is_deleted: false },
      relations: PaymentTransactionDao.detailRelations,
    });
  }

  async findPaginated(
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<PaymentTransaction>> {
    const qb = this.createQueryBuilder('payment')
      .leftJoinAndSelect('payment.customer', 'customer')
      .leftJoinAndSelect('payment.vehicleRecord', 'vehicleRecord')
      .leftJoinAndSelect('payment.appointment', 'appointment')
      .leftJoinAndSelect('payment.job', 'job');

    const options = buildTypeOrmPaginationOptions<PaymentTransaction, PaymentTransaction>(
      query,
      {
        searchFields: ['status', 'payment_type', 'customer.name'],
        allowedSortFields: [
          'payment_transaction_id',
          'status',
          'pay_date',
          'grand_total',
          'created_at',
        ],
        defaultSort: { created_at: 'DESC' },
        baseWhere: { is_deleted: false },
      },
    );

    const response = await this.paginationService.paginateQueryBuilder(qb, 'payment', options);
    return toPaginatedResult(response);
  }

  async getNextPaymentTransactionId(): Promise<number> {
    const result = await this.createQueryBuilder('payment')
      .select('MAX(payment.payment_transaction_id)', 'max')
      .getRawOne();
    const max = result?.max ? Number(result.max) : 0;
    return max + 1;
  }
}
