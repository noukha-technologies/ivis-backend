import { Injectable } from '@nestjs/common';
import { CreatePaymentDto, UpdatePaymentDto } from '../../../../common/dto/payment.dto';
import { PaginationQueryDto } from '../../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../../common/interfaces/pagination.interface';
import {
  DatabaseException,
  DuplicateResourceException,
  ResourceNotFoundException,
} from '../../../../common/exceptions/custom.exception';
import { AppLogger } from '../../../../common/logger/app.logger';
import type { UserContext } from '../../../../common/dto/auth.dto';
import { getCreatedById } from '../../../../common/utils/created-by.util';
import { generateSnowflakeId } from '../../../../common/shared/snowflakeIdGeneration';
import { CustomerDao } from '../../../database/dao/customer.dao';
import { PaymentDao } from '../../../database/dao/payment.dao';
import { Payment } from '../../../database/entity/payment.entity';

@Injectable()
export class PaymentService {
  private static readonly context = 'PaymentService';

  constructor(
    private readonly paymentDao: PaymentDao,
    private readonly customerDao: CustomerDao,
    private readonly logger: AppLogger,
  ) {}

  async create(createPaymentDto: CreatePaymentDto, actor: UserContext): Promise<Payment> {
    this.logger.log(`Creating Payment with code: ${createPaymentDto.code}`, PaymentService.context);

    try {
      await this.resolveCustomer(createPaymentDto.customer_id);

      const existingCode = await this.paymentDao.findByCode(createPaymentDto.code);
      if (existingCode) {
        throw new DuplicateResourceException('Payment', 'code', createPaymentDto.code);
      }

      let payment_id = createPaymentDto.payment_id;
      if (!payment_id) {
        payment_id = await this.paymentDao.getNextId();
      } else {
        const existingId = await this.paymentDao.findByPaymentId(payment_id);
        if (existingId) {
          throw new DuplicateResourceException('Payment', 'payment_id', payment_id);
        }
      }

      const payment = this.paymentDao.create({
        id: generateSnowflakeId(),
        customer_id: createPaymentDto.customer_id,
        code: createPaymentDto.code,
        payment_id,
        status: createPaymentDto.status || 'Active',
        payment_mode: createPaymentDto.payment_mode,
        type: createPaymentDto.type,
        amount: createPaymentDto.amount,
        created_by: getCreatedById(actor),
      });
      const savedPayment = await this.paymentDao.save(payment);

      this.logger.log(`Payment created with ID: ${savedPayment.id}`, PaymentService.context);
      return (await this.paymentDao.findActiveById(savedPayment.id)) ?? savedPayment;
    } catch (error) {
      if (
        error instanceof DuplicateResourceException ||
        error instanceof ResourceNotFoundException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to create Payment: ${(error as Error).message}`,
        (error as Error).stack,
        PaymentService.context,
      );
      throw new DatabaseException('Failed to create Payment record. Please try again.');
    }
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<Payment>> {
    this.logger.log(`Fetching Payments — page: ${query.page}, limit: ${query.limit}`, PaymentService.context);

    try {
      return await this.paymentDao.findPaginated(query);
    } catch (error) {
      this.logger.error(
        `Failed to fetch Payments: ${(error as Error).message}`,
        (error as Error).stack,
        PaymentService.context,
      );
      throw new DatabaseException('Failed to fetch Payment records. Please try again.');
    }
  }

  async findOne(id: string): Promise<Payment> {
    this.logger.log(`Fetching Payment ID: ${id}`, PaymentService.context);

    try {
      const payment = await this.paymentDao.findActiveById(id);
      if (!payment) {
        throw new ResourceNotFoundException('Payment', id);
      }
      return payment;
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to fetch Payment: ${(error as Error).message}`,
        (error as Error).stack,
        PaymentService.context,
      );
      throw new DatabaseException('Failed to fetch Payment record. Please try again.');
    }
  }

  async update(id: string, updatePaymentDto: UpdatePaymentDto): Promise<Payment> {
    this.logger.log(`Updating Payment ID: ${id}`, PaymentService.context);

    try {
      const payment = await this.findOne(id);

      if (updatePaymentDto.customer_id) {
        await this.resolveCustomer(updatePaymentDto.customer_id);
      }

      if (updatePaymentDto.code && updatePaymentDto.code !== payment.code) {
        const existingCode = await this.paymentDao.findByCode(updatePaymentDto.code);
        if (existingCode) {
          throw new DuplicateResourceException('Payment', 'code', updatePaymentDto.code);
        }
      }

      const mergedPayment = this.paymentDao.merge(payment, {
        customer_id: updatePaymentDto.customer_id ?? payment.customer_id,
        code: updatePaymentDto.code ?? payment.code,
        status: updatePaymentDto.status ?? payment.status,
        payment_mode: updatePaymentDto.payment_mode ?? payment.payment_mode,
        type: updatePaymentDto.type ?? payment.type,
        amount: updatePaymentDto.amount ?? payment.amount,
      });
      const savedPayment = await this.paymentDao.save(mergedPayment);

      this.logger.log(`Payment updated ID: ${savedPayment.id}`, PaymentService.context);
      return (await this.paymentDao.findActiveById(savedPayment.id)) ?? savedPayment;
    } catch (error) {
      if (error instanceof ResourceNotFoundException || error instanceof DuplicateResourceException) {
        throw error;
      }
      this.logger.error(
        `Failed to update Payment: ${(error as Error).message}`,
        (error as Error).stack,
        PaymentService.context,
      );
      throw new DatabaseException('Failed to update Payment record. Please try again.');
    }
  }

  async remove(id: string): Promise<void> {
    this.logger.log(`Deleting Payment ID: ${id}`, PaymentService.context);

    try {
      const payment = await this.findOne(id);
      payment.is_deleted = true;
      await this.paymentDao.save(payment);
      this.logger.log(`Payment soft-deleted ID: ${id}`, PaymentService.context);
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to delete Payment: ${(error as Error).message}`,
        (error as Error).stack,
        PaymentService.context,
      );
      throw new DatabaseException('Failed to delete Payment record. Please try again.');
    }
  }

  private async resolveCustomer(customerId: string): Promise<void> {
    const customer = await this.customerDao.findActiveById(customerId);
    if (!customer) {
      throw new ResourceNotFoundException('Customer', customerId);
    }
  }
}
