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
import { Payment } from '../../../database/entity/payment.entity';
import { PaymentDao } from '../../../database/dao/payment.dao';

@Injectable()
export class PaymentService {
  private static readonly context = 'PaymentService';

  constructor(
    private readonly paymentDao: PaymentDao,
    private readonly logger: AppLogger,
  ) {}

  async create(createPaymentDto: CreatePaymentDto, actor: UserContext): Promise<Payment> {
    this.logger.log(`Creating Payment with code: ${createPaymentDto.code}`, PaymentService.context);

    try {
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
        ...createPaymentDto,
        customer_phone: createPaymentDto.phoneNo || null,
        payment_id,
        status: createPaymentDto.status || 'Active',
        created_by: getCreatedById(actor),
      });
      const savedPayment = await this.paymentDao.save(payment);

      this.logger.log(`Payment created with ID: ${savedPayment.id}`, PaymentService.context);
      return savedPayment;
    } catch (error) {
      if (error instanceof DuplicateResourceException) {
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

      if (updatePaymentDto.code && updatePaymentDto.code !== payment.code) {
        const existingCode = await this.paymentDao.findByCode(updatePaymentDto.code);
        if (existingCode) {
          throw new DuplicateResourceException('Payment', 'code', updatePaymentDto.code);
        }
      }

      const mergedPayment = this.paymentDao.merge(payment, {
        ...updatePaymentDto,
        customer_phone: updatePaymentDto.phoneNo !== undefined ? updatePaymentDto.phoneNo : payment.customer_phone,
      });
      const savedPayment = await this.paymentDao.save(mergedPayment);

      this.logger.log(`Payment updated ID: ${savedPayment.id}`, PaymentService.context);
      return savedPayment;
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
}
