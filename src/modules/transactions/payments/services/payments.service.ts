import { Injectable } from '@nestjs/common';
import {
  DatabaseException,
  DuplicateResourceException,
  ResourceNotFoundException,
} from '../../../../common/exceptions/custom.exception';

import { getCreatedById } from '../../../../common/utils/created-by.util';
import { generateSnowflakeId } from '../../../../common/shared/snowflakeIdGeneration';

import type { UserContext } from '../../../../common/dto/auth.dto';
import { PaginationQueryDto } from '../../../../common/dto/pagination.dto';
import { CreatePaymentsDto, UpdatePaymentsDto } from '../../../../common/dto/payments.dto';

import { JobService } from '../../../jobs/services/job.service';
import { Payments } from '../../../database/entity/payments.entity';
import { PaymentStatusEnum, PaymentTypeEnum } from '../../../../common/enums/payment.enums';

import { AppLogger } from '../../../../common/logger/app.logger';
import { PaginatedResult } from '../../../../common/interfaces/pagination.interface';

import { CustomerDao } from '../../../database/dao/customer.dao';
import { AppointmentDao } from '../../../database/dao/appointment.dao';
import { PaymentsDao } from '../../../database/dao/payments.dao';
import { VehicleRecordDao } from '../../../database/dao/vehicle-record.dao';

@Injectable()
export class PaymentsService {
  private static readonly context = 'PaymentsService';

  constructor(
    private readonly logger: AppLogger,
    private readonly jobService: JobService,
    private readonly customerDao: CustomerDao,
    private readonly appointmentDao: AppointmentDao,
    private readonly vehicleRecordDao: VehicleRecordDao,
    private readonly paymentsDao: PaymentsDao,
  ) { }

  async create(createDto: CreatePaymentsDto, actor: UserContext): Promise<Payments> {
    this.logger.log('Creating payment transaction', PaymentsService.context);
    try {
      const resolved = await this.resolveReferences(createDto);

      let paymentsId = createDto.payments_id;
      if (!paymentsId) {
        paymentsId = await this.paymentsDao.getNextPaymentsId();
      } else {
        const existing = await this.paymentsDao.findByPaymentsId(paymentsId);
        if (existing) {
          throw new DuplicateResourceException('Payment', 'payments_id', paymentsId);
        }
      }

      const isPaid = createDto.payment_type === 'Paid';
      const payDate = isPaid ? createDto.pay_date ? new Date(createDto.pay_date)
        : new Date() : createDto.pay_date ? new Date(createDto.pay_date) : undefined;

      const payment = this.paymentsDao.create({
        id: generateSnowflakeId(),
        payment_id: paymentsId,
        appointment_id: resolved.appointment_id,
        customer_id: resolved.customer_id,
        vehicle_record_id: resolved.vehicle_record_id,
        anpr_capture_id: resolved.anpr_capture_id,
        centre_id: resolved.centre_id,
        line_id: resolved.line_id,
        admin_pc_id: resolved.admin_pc_id,
        camera_id: resolved.camera_id,
        payment_type: createDto.payment_type as PaymentTypeEnum,
        payment_mode: createDto.payment_mode,
        status: PaymentStatusEnum.PAID,
        grand_total: createDto.grand_total,
        charges: createDto.charges ?? 0,
        vat: createDto.vat ?? 0,
        pay_date: payDate,
        created_by: getCreatedById(actor),
      });

      let saved = await this.paymentsDao.save(payment);

      if (isPaid && createDto.auto_create_job !== false) {
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
        saved = await this.paymentsDao.save(saved);
        this.logger.log(`Job auto-created ID: ${job.id} from payment $
          {saved.id}`, PaymentsService.context);
      }

      return (await this.paymentsDao.findActiveById(saved.id)) ?? saved;
    } catch (error) {
      if (
        error instanceof DuplicateResourceException ||
        error instanceof ResourceNotFoundException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to create payment: ${(error as Error).message}`,
        (error as Error).stack,
        PaymentsService.context,
      );
      throw new DatabaseException('Failed to create payment. Please try again.');
    }
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<Payments>> {
    try {
      return await this.paymentsDao.findPaginated(query);
    } catch {
      throw new DatabaseException('Failed to fetch payments. Please try again.');
    }
  }

  async findOne(id: string): Promise<Payments> {
    const payment = await this.paymentsDao.findActiveById(id);
    if (!payment) {
      throw new ResourceNotFoundException('Payment', id);
    }
    return payment;
  }

  async update(id: string, updateDto: UpdatePaymentsDto, actor: UserContext): Promise<Payments> {
    const payment = await this.findOne(id);
    const resolved = await this.resolveReferences({
      ...updateDto,
      customer_id: updateDto.customer_id ?? payment.customer_id,
      vehicle_record_id: updateDto.vehicle_record_id ?? payment.vehicle_record_id,
      appointment_id: updateDto.appointment_id ?? payment.appointment_id ?? undefined,
    });

    const nextType = updateDto.payment_type ?? payment.payment_type;
    const merged = this.paymentsDao.merge(payment, {
      ...updateDto,
      payment_type: nextType as PaymentTypeEnum,
      payment_mode: updateDto.payment_mode,
      customer_id: resolved.customer_id,
      vehicle_record_id: resolved.vehicle_record_id,
      anpr_capture_id: resolved.anpr_capture_id,
      centre_id: resolved.centre_id,
      line_id: resolved.line_id,
      admin_pc_id: resolved.admin_pc_id,
      camera_id: resolved.camera_id,
      ...(updateDto.pay_date ? { pay_date: new Date(updateDto.pay_date) } : {}),
      ...(nextType === 'Paid' && !payment.pay_date ? { pay_date: new Date() } : {}),
    });

    let saved = await this.paymentsDao.save(merged);

    if (
      nextType === 'Paid' &&
      payment.payment_type !== 'Paid' &&
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
      saved = await this.paymentsDao.save(saved);
    }

    return (await this.paymentsDao.findActiveById(saved.id)) ?? saved;
  }

  async remove(id: string): Promise<void> {
    const payment = await this.findOne(id);
    payment.is_deleted = true;
    await this.paymentsDao.save(payment);
  }

  async lookupJob(jobId: string) {
    const job = await this.jobService.findOne(jobId);
    return {
      customer_id: job.customer_id,
      customer_name: job.customer?.name ?? null,
      vehicle_record_id: job.vehicle_record_id,
      anpr_capture_id: job.anpr_capture_id ?? null,
      centre_id: job.centre_id ?? null,
      line_id: job.line_id ?? null,
      admin_pc_id: job.admin_pc_id ?? null,
      camera_id: job.camera_id ?? null,
    };
  }

  private async resolveReferences(
    dto: Pick<
      CreatePaymentsDto,
      | 'job_id'
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
    let customerId = dto.customer_id;
    let vehicleRecordId = dto.vehicle_record_id;
    let anprCaptureId = dto.anpr_capture_id;
    let centreId = dto.centre_id;
    let lineId = dto.line_id;
    let adminPcId = dto.admin_pc_id;
    let cameraId = dto.camera_id;
    let appointmentId = dto.appointment_id;

    if (dto.job_id) {
      const job = await this.jobService.findOne(dto.job_id);
      customerId = customerId ?? job.customer_id;
      vehicleRecordId = vehicleRecordId ?? job.vehicle_record_id;
      anprCaptureId = anprCaptureId ?? job.anpr_capture_id ?? undefined;
      centreId = centreId ?? job.centre_id ?? undefined;
      lineId = lineId ?? job.line_id ?? undefined;
      adminPcId = adminPcId ?? job.admin_pc_id ?? undefined;
      cameraId = cameraId ?? job.camera_id ?? undefined;
    }

    if (!customerId) throw new ResourceNotFoundException('Customer', 'undefined');
    if (!vehicleRecordId) throw new ResourceNotFoundException('VehicleRecord', 'undefined');

    const customer = await this.customerDao.findActiveById(customerId);
    if (!customer) throw new ResourceNotFoundException('Customer', customerId);

    const vehicleRecord = await this.vehicleRecordDao.findActiveById(vehicleRecordId);
    if (!vehicleRecord) throw new ResourceNotFoundException('VehicleRecord', vehicleRecordId);

    if (appointmentId) {
      const appointment = await this.appointmentDao.findActiveById(appointmentId);
      if (!appointment) throw new ResourceNotFoundException('Appointment', appointmentId);
      anprCaptureId = anprCaptureId ?? appointment.anpr_capture_id ?? undefined;
      centreId = centreId ?? appointment.centre_id ?? undefined;
      lineId = lineId ?? appointment.line_id ?? undefined;
    }

    return {
      appointment_id: appointmentId,
      customer_id: customerId,
      vehicle_record_id: vehicleRecordId,
      anpr_capture_id: anprCaptureId,
      centre_id: centreId,
      line_id: lineId,
      admin_pc_id: adminPcId,
      camera_id: cameraId,
    };
  }
}
