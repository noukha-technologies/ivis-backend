import { Injectable } from '@nestjs/common';
import {
  CreatePaymentTypeDto,
  UpdatePaymentTypeDto,
} from '../../../../common/dto/payment-type.dto';
import { PaginationQueryDto } from '../../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../../common/interfaces/pagination.interface';
import {
  DuplicateResourceException,
  ResourceNotFoundException,
} from '../../../../common/exceptions/custom.exception';
import { AppLogger } from '../../../../common/logger/app.logger';
import { generateSnowflakeId } from '../../../../common/shared/snowflakeIdGeneration';
import { PaymentType } from '../../../database/entity/payment-type.entity';
import { PaymentTypeDao } from '../../../database/dao/payment-type.dao';
import type { UserContext } from '../../../../common/dto/auth.dto';
import { getCreatedById } from '../../../../common/utils/created-by.util';

@Injectable()
export class PaymentTypeService {
  private static readonly context = 'PaymentTypeService';

  constructor(
    private readonly paymentTypeDao: PaymentTypeDao,
    private readonly logger: AppLogger,
  ) {}

  async create(
    dto: CreatePaymentTypeDto,
    actor: UserContext,
  ): Promise<PaymentType> {
    this.logger.log(
      `Creating payment type — code: ${dto.code}`,
      PaymentTypeService.context,
    );

    const existing = await this.paymentTypeDao.findByCode(dto.code);
    if (existing) {
      throw new DuplicateResourceException('PaymentType', 'code', dto.code);
    }

    const paymentTypeId =
      dto.payment_type_id ?? (await this.paymentTypeDao.getNextPaymentTypeId());

    const paymentType = this.paymentTypeDao.create({
      id: generateSnowflakeId(),
      payment_type_id: paymentTypeId,
      name: dto.name,
      code: dto.code,
      status: dto.status ?? 'Active',
      created_by: getCreatedById(actor),
    });

    return this.paymentTypeDao.save(paymentType);
  }

  async findAll(
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<PaymentType>> {
    return this.paymentTypeDao.findPaginated(query);
  }

  async findOne(id: string): Promise<PaymentType> {
    const paymentType = await this.paymentTypeDao.findActiveById(id);
    if (!paymentType) {
      throw new ResourceNotFoundException('PaymentType', id);
    }
    return paymentType;
  }

  async update(id: string, dto: UpdatePaymentTypeDto): Promise<PaymentType> {
    const paymentType = await this.findOne(id);

    if (dto.code && dto.code !== paymentType.code) {
      const existing = await this.paymentTypeDao.findByCode(dto.code);
      if (existing) {
        throw new DuplicateResourceException('PaymentType', 'code', dto.code);
      }
    }

    Object.assign(paymentType, dto);
    return this.paymentTypeDao.save(paymentType);
  }

  async remove(id: string): Promise<void> {
    const paymentType = await this.findOne(id);
    paymentType.is_deleted = true;
    await this.paymentTypeDao.save(paymentType);
  }
}
