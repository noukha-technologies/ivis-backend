import { Injectable } from '@nestjs/common';
import {
  CreatePaymentTransactionDto,
  UpdatePaymentTransactionDto,
} from '../../../../common/dto/payment-transaction.dto';
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
import { AppointmentDao } from '../../../database/dao/appointment.dao';
import { CustomerDao } from '../../../database/dao/customer.dao';
import { PaymentTransactionDao } from '../../../database/dao/payment-transaction.dao';
import { VehicleRecordDao } from '../../../database/dao/vehicle-record.dao';
import { PaymentTransaction } from '../../../database/entity/payment-transaction.entity';
import { JobService } from '../../../jobs/services/job.service';

@Injectable()
export class PaymentTransactionService {
  private static readonly context = 'PaymentTransactionService';

  constructor(
    private readonly paymentTransactionDao: PaymentTransactionDao,
    private readonly appointmentDao: AppointmentDao,
    private readonly customerDao: CustomerDao,
    private readonly vehicleRecordDao: VehicleRecordDao,
    private readonly jobService: JobService,
    private readonly logger: AppLogger,
  ) {}

  async create(
    createDto: CreatePaymentTransactionDto,
    actor: UserContext,
  ): Promise<PaymentTransaction> {
    this.logger.log('Creating payment transaction', PaymentTransactionService.context);

    try {
      const resolved = await this.resolveFromAppointment(createDto);

      let paymentTransactionId = createDto.payment_transaction_id;
      if (!paymentTransactionId) {
        paymentTransactionId = await this.paymentTransactionDao.getNextPaymentTransactionId();
      } else {
        const existing =
          await this.paymentTransactionDao.findByPaymentTransactionId(paymentTransactionId);
        if (existing) {
          throw new DuplicateResourceException(
            'PaymentTransaction',
            'payment_transaction_id',
            paymentTransactionId,
          );
        }
      }

      const charges = createDto.charges ?? 0;
      const vat = createDto.vat ?? 0;
      const grandTotal = createDto.grand_total ?? charges + vat;
      const status = createDto.status || 'Pending';
      const payDate =
        status === 'Paid'
          ? createDto.pay_date
            ? new Date(createDto.pay_date)
            : new Date()
          : createDto.pay_date
            ? new Date(createDto.pay_date)
            : undefined;

      const payment = this.paymentTransactionDao.create({
        id: generateSnowflakeId(),
        payment_transaction_id: paymentTransactionId,
        appointment_id: resolved.appointment_id,
        customer_id: resolved.customer_id,
        vehicle_record_id: resolved.vehicle_record_id,
        anpr_capture_id: resolved.anpr_capture_id,
        centre_id: resolved.centre_id,
        line_id: resolved.line_id,
        admin_pc_id: resolved.admin_pc_id,
        camera_id: resolved.camera_id,
        payment_type: createDto.payment_type,
        status,
        charges,
        vat,
        grand_total: grandTotal,
        pay_date: payDate,
        created_by: getCreatedById(actor),
      });

      let saved = await this.paymentTransactionDao.save(payment);

      if (status === 'Paid' && createDto.auto_create_job !== false) {
        const job = await this.jobService.create(
          {
            source: createDto.job_source || 'Booked',
            status: 'Pending',
            customer_id: resolved.customer_id,
            vehicle_record_id: resolved.vehicle_record_id,
            anpr_capture_id: resolved.anpr_capture_id,
            centre_id: resolved.centre_id,
            line_id: resolved.line_id,
            admin_pc_id: resolved.admin_pc_id,
            camera_id: resolved.camera_id,
          },
          actor,
        );

        saved.job_id = job.id;
        saved = await this.paymentTransactionDao.save(saved);
        this.logger.log(
          `Job auto-created ID: ${job.id} from payment ${saved.id}`,
          PaymentTransactionService.context,
        );
      }

      return (await this.paymentTransactionDao.findActiveById(saved.id)) ?? saved;
    } catch (error) {
      if (
        error instanceof DuplicateResourceException ||
        error instanceof ResourceNotFoundException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to create payment transaction: ${(error as Error).message}`,
        (error as Error).stack,
        PaymentTransactionService.context,
      );
      throw new DatabaseException('Failed to create payment transaction. Please try again.');
    }
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<PaymentTransaction>> {
    try {
      return await this.paymentTransactionDao.findPaginated(query);
    } catch (error) {
      throw new DatabaseException('Failed to fetch payment transactions. Please try again.');
    }
  }

  async findOne(id: string): Promise<PaymentTransaction> {
    const payment = await this.paymentTransactionDao.findActiveById(id);
    if (!payment) {
      throw new ResourceNotFoundException('PaymentTransaction', id);
    }
    return payment;
  }

  async update(
    id: string,
    updateDto: UpdatePaymentTransactionDto,
    actor: UserContext,
  ): Promise<PaymentTransaction> {
    const payment = await this.findOne(id);
    const previousStatus = payment.status;
    const resolved = await this.resolveFromAppointment({
      ...updateDto,
      customer_id: updateDto.customer_id ?? payment.customer_id,
      vehicle_record_id: updateDto.vehicle_record_id ?? payment.vehicle_record_id,
      appointment_id: updateDto.appointment_id ?? payment.appointment_id ?? undefined,
    });

    const nextStatus = updateDto.status ?? payment.status;
    const merged = this.paymentTransactionDao.merge(payment, {
      ...updateDto,
      customer_id: resolved.customer_id,
      vehicle_record_id: resolved.vehicle_record_id,
      anpr_capture_id: resolved.anpr_capture_id,
      centre_id: resolved.centre_id,
      line_id: resolved.line_id,
      admin_pc_id: resolved.admin_pc_id,
      camera_id: resolved.camera_id,
      ...(updateDto.pay_date ? { pay_date: new Date(updateDto.pay_date) } : {}),
      ...(nextStatus === 'Paid' && !payment.pay_date ? { pay_date: new Date() } : {}),
    });

    let saved = await this.paymentTransactionDao.save(merged);

    if (
      nextStatus === 'Paid' &&
      previousStatus !== 'Paid' &&
      !saved.job_id &&
      updateDto.auto_create_job !== false
    ) {
      const job = await this.jobService.create(
        {
          source: updateDto.job_source || 'Booked',
          status: 'Pending',
          customer_id: saved.customer_id,
          vehicle_record_id: saved.vehicle_record_id,
          anpr_capture_id: saved.anpr_capture_id ?? undefined,
          centre_id: saved.centre_id ?? undefined,
          line_id: saved.line_id ?? undefined,
          admin_pc_id: saved.admin_pc_id ?? undefined,
          camera_id: saved.camera_id ?? undefined,
        },
        actor,
      );
      saved.job_id = job.id;
      saved = await this.paymentTransactionDao.save(saved);
    }

    return (await this.paymentTransactionDao.findActiveById(saved.id)) ?? saved;
  }

  async remove(id: string): Promise<void> {
    const payment = await this.findOne(id);
    payment.is_deleted = true;
    await this.paymentTransactionDao.save(payment);
  }

  private async resolveFromAppointment(
    dto: Pick<
      CreatePaymentTransactionDto,
      | 'appointment_id'
      | 'customer_id'
      | 'vehicle_record_id'
      | 'anpr_capture_id'
      | 'centre_id'
      | 'line_id'
      | 'admin_pc_id'
      | 'camera_id'
    >,
  ) {
    const customer = await this.customerDao.findActiveById(dto.customer_id);
    if (!customer) {
      throw new ResourceNotFoundException('Customer', dto.customer_id);
    }

    const vehicleRecord = await this.vehicleRecordDao.findActiveById(dto.vehicle_record_id);
    if (!vehicleRecord) {
      throw new ResourceNotFoundException('VehicleRecord', dto.vehicle_record_id);
    }

    let appointmentId = dto.appointment_id;
    let anprCaptureId = dto.anpr_capture_id;
    let centreId = dto.centre_id;
    let lineId = dto.line_id;
    let adminPcId = dto.admin_pc_id;
    let cameraId = dto.camera_id;

    if (dto.appointment_id) {
      const appointment = await this.appointmentDao.findActiveById(dto.appointment_id);
      if (!appointment) {
        throw new ResourceNotFoundException('Appointment', dto.appointment_id);
      }
      appointmentId = appointment.id;
      anprCaptureId = anprCaptureId ?? appointment.anpr_capture_id ?? undefined;
      centreId = centreId ?? appointment.centre_id ?? undefined;
      lineId = lineId ?? appointment.line_id ?? undefined;
    }

    return {
      appointment_id: appointmentId,
      customer_id: dto.customer_id,
      vehicle_record_id: dto.vehicle_record_id,
      anpr_capture_id: anprCaptureId,
      centre_id: centreId,
      line_id: lineId,
      admin_pc_id: adminPcId,
      camera_id: cameraId,
    };
  }
}
