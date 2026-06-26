import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager, EntityTarget, ObjectLiteral } from 'typeorm';

import { CreateJobIntakeDto } from '../../../common/dto/job.dto';
import type { UserContext } from '../../../common/dto/auth.dto';

import type { JobSource } from '../../../common/enums/job.enums';
import { PaymentStatusEnum, PaymentTypeEnum } from '../../../common/enums/payment.enums';
import { JobIntakeResult } from '../../../common/interfaces/job.interface';

import { AppLogger } from '../../../common/logger/app.logger';
import { DatabaseException, ResourceNotFoundException } from '../../../common/exceptions/custom.exception';

import { getCreatedById } from '../../../common/utils/created-by.util';
import { saveBase64File } from '../../../common/utils/file-storage.util';
import { generateSnowflakeId } from '../../../common/shared/snowflakeIdGeneration';

import { JobDao } from '../../database/dao/job.dao';
import { LineDao } from '../../database/dao/line.dao';
import { CentreDao } from '../../database/dao/centre.dao';
import { CameraDao } from '../../database/dao/camera.dao';
import { AdminPcDao } from '../../database/dao/admin-pc.dao';
import { CustomerDao } from '../../database/dao/customer.dao';
import { PaymentsDao } from '../../database/dao/payments.dao';
import { VehicleRecordDao } from '../../database/dao/vehicle-record.dao';

import { Job } from '../../database/entity/job.entity';
import { Customer } from '../../database/entity/customer.entity';
import { VehicleRecord } from '../../database/entity/vehicle-record.entity';
import { Payments } from '../../database/entity/payments.entity';

@Injectable()
export class JobIntakeService {
  private static readonly context = 'JobIntakeService';

  constructor(
    private readonly jobDao: JobDao,
    private readonly lineDao: LineDao,
    private readonly logger: AppLogger,
    private readonly centreDao: CentreDao,
    private readonly cameraDao: CameraDao,
    private readonly adminPcDao: AdminPcDao,
    private readonly dataSource: DataSource,
    private readonly customerDao: CustomerDao,
    private readonly paymentsDao: PaymentsDao,
    private readonly vehicleRecordDao: VehicleRecordDao,
  ) { }

  async createFromIntake(createDto: CreateJobIntakeDto, actor: UserContext): Promise<JobIntakeResult> {
    this.logger.log(
      `Creating job intake for customer: ${createDto.customer_name}`,
      JobIntakeService.context,
    );

    await this.validateSiteReferences(createDto);

    const paymentSnowflakeId = generateSnowflakeId();
    const fileSubdirectory = `payment-transactions/${paymentSnowflakeId}`;

    let captureImagePath: string | undefined;
    let attachmentPath: string | undefined;

    if (createDto.payment.capture_image) {
      const saved = await saveBase64File(createDto.payment.capture_image, fileSubdirectory, 'capture.jpg');
      captureImagePath = saved.relativePath;
    }

    if (createDto.payment.attachment) {
      const saved = await saveBase64File(
        createDto.payment.attachment,
        fileSubdirectory,
        createDto.payment.attachment_filename ?? 'attachment.bin',
      );
      attachmentPath = saved.relativePath;
    }

    const isPaid = createDto.payment.type === 'Paid';
    const grandTotal = isPaid ? (createDto.payment.amount ?? 0) : 0;
    const jobSource = createDto.source ?? 'Walk-In';
    const createdBy = getCreatedById(actor);

    try {
      const result = await this.dataSource.transaction(async (manager) => {
        const customer = await this.upsertCustomer(manager, createDto, createdBy);
        const vehicleRecord = await this.upsertVehicleRecord(
          manager,
          createDto,
          customer.id,
          createdBy,
        );

        if (customer.vehicle_record_id !== vehicleRecord.id) {
          customer.vehicle_record_id = vehicleRecord.id;
          await manager.save(Customer, customer);
        }

        const paymentId = await this.getNextNumericId(
          manager,
          Payments,
          'payment_id',
        );

        const payment = manager.create(Payments, {
          id: paymentSnowflakeId,
          payment_id: paymentId,
          customer_id: customer.id,
          vehicle_record_id: vehicleRecord.id,
          centre_id: createDto.centre_id,
          line_id: createDto.line_id,
          admin_pc_id: createDto.admin_pc_id,
          camera_id: createDto.camera_id,
          payment_type: createDto.payment.type as PaymentTypeEnum,
          payment_mode: createDto.payment.mode,
          status: isPaid ? PaymentStatusEnum.PAID : PaymentStatusEnum.PENDING,
          charges: grandTotal,
          vat: 0,
          grand_total: grandTotal,
          pay_date: isPaid ? new Date() : undefined,
          capture_image_path: captureImagePath,
          attachment_path: attachmentPath,
          attachment_filename: createDto.payment.attachment_filename,
          created_by: createdBy,
        });

        let savedPayment = await manager.save(Payments, payment);
        let job: Job | null = null;

        if (isPaid) {
          job = await this.createJobRecord(
            manager,
            {
              source: jobSource as JobSource,
              customerId: customer.id,
              vehicleRecordId: vehicleRecord.id,
              centreId: createDto.centre_id,
              lineId: createDto.line_id,
              adminPcId: createDto.admin_pc_id,
              cameraId: createDto.camera_id,
              createdBy,
            },
          );
          savedPayment.job_id = job.id;
          savedPayment = await manager.save(Payments, savedPayment);
        }

        return { customer, vehicleRecord, savedPayment, job };
      });

      const customer =
        (await this.customerDao.findActiveById(result.customer.id)) ?? result.customer;
      const vehicleRecord =
        (await this.vehicleRecordDao.findActiveById(result.vehicleRecord.id)) ??
        result.vehicleRecord;
      const payments =
        (await this.paymentsDao.findActiveById(result.savedPayment.id)) ??
        result.savedPayment;
      const job = result.job
        ? (await this.jobDao.findActiveById(result.job.id)) ?? result.job
        : null;

      this.logger.log(
        `Job intake completed — payment: ${payments.id}, job: ${job?.id ?? 'none'}`,
        JobIntakeService.context,
      );

      return {
        customer,
        vehicle_record: vehicleRecord,
        payments: payments,
        job,
      };
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to create job intake: ${(error as Error).message}`,
        (error as Error).stack,
        JobIntakeService.context,
      );
      throw new DatabaseException('Failed to create job. Please try again.');
    }
  }

  private async validateSiteReferences(
    dto: Pick<CreateJobIntakeDto, 'centre_id' | 'line_id' | 'admin_pc_id' | 'camera_id'>,
  ): Promise<void> {
    if (dto.centre_id) {
      const centre = await this.centreDao.findActiveById(dto.centre_id);
      if (!centre) {
        throw new ResourceNotFoundException('Centre', dto.centre_id);
      }
    }
    if (dto.line_id) {
      const line = await this.lineDao.findActiveById(dto.line_id);
      if (!line) {
        throw new ResourceNotFoundException('Line', dto.line_id);
      }
    }
    if (dto.admin_pc_id) {
      const adminPc = await this.adminPcDao.findActiveById(dto.admin_pc_id);
      if (!adminPc) {
        throw new ResourceNotFoundException('AdminPc', dto.admin_pc_id);
      }
    }
    if (dto.camera_id) {
      const camera = await this.cameraDao.findActiveById(dto.camera_id);
      if (!camera) {
        throw new ResourceNotFoundException('Camera', dto.camera_id);
      }
    }
  }

  private async upsertCustomer(
    manager: EntityManager,
    dto: CreateJobIntakeDto,
    createdBy: string,
  ): Promise<Customer> {
    const phone = dto.phone.trim();
    let customer = await this.customerDao.findActiveByPhone(phone);

    if (customer) {
      customer = manager.merge(Customer, customer, {
        customer_name: dto.customer_name.trim(),
        phone,
        owner_name: dto.customer_name.trim(),
        mulkiya_id: dto.mulkiya_id?.trim() ?? customer.mulkiya_id,
        chassis_no: dto.vin_no?.trim() ?? customer.chassis_no,
      });
      return manager.save(Customer, customer);
    }

    const customerId = await this.getNextNumericId(manager, Customer, 'customer_id');
    const created = manager.create(Customer, {
      id: generateSnowflakeId(),
      customer_id: customerId,
      customer_name: dto.customer_name.trim(),
      phone,
      owner_name: dto.customer_name.trim(),
      mulkiya_id: dto.mulkiya_id?.trim(),
      chassis_no: dto.vin_no?.trim(),
      created_by: createdBy,
    });

    return manager.save(Customer, created);
  }

  private async upsertVehicleRecord(
    manager: EntityManager,
    dto: CreateJobIntakeDto,
    customerId: string,
    createdBy: string,
  ): Promise<VehicleRecord> {
    const plateNumber = dto.vehicle_no.trim();
    let vehicleRecord = await this.vehicleRecordDao.findByPlateNumber(plateNumber);

    if (vehicleRecord) {
      vehicleRecord = manager.merge(VehicleRecord, vehicleRecord, {
        chassis_no: dto.vin_no?.trim() ?? vehicleRecord.chassis_no,
      });
      return manager.save(VehicleRecord, vehicleRecord);
    }

    const vehicleRecordId = await this.getNextNumericId(
      manager,
      VehicleRecord,
      'vehicle_record_id',
    );
    const created = manager.create(VehicleRecord, {
      id: generateSnowflakeId(),
      vehicle_record_id: vehicleRecordId,
      plate_number: plateNumber,
      chassis_no: dto.vin_no?.trim(),
      created_by: createdBy,
    });

    const saved = await manager.save(VehicleRecord, created);
    await manager.update(Customer, { id: customerId }, { vehicle_record_id: saved.id });
    return saved;
  }

  private async createJobRecord(
    manager: EntityManager,
    input: {
      source: JobSource;
      customerId: string;
      vehicleRecordId: string;
      centreId?: string;
      lineId?: string;
      adminPcId?: string;
      cameraId?: string;
      createdBy: string;
    },
  ): Promise<Job> {
    const jobId = await this.getNextNumericId(manager, Job, 'job_id');
    const job = manager.create(Job, {
      id: generateSnowflakeId(),
      job_id: jobId,
      source: input.source ?? 'Walk-In',
      status: 'Pending',
      customer_id: input.customerId,
      vehicle_record_id: input.vehicleRecordId,
      centre_id: input.centreId,
      line_id: input.lineId,
      admin_pc_id: input.adminPcId,
      camera_id: input.cameraId,
      created_by: input.createdBy,
    });

    return manager.save(Job, job);
  }

  private async getNextNumericId(
    manager: EntityManager,
    entity: EntityTarget<ObjectLiteral>,
    column: string,
  ): Promise<number> {
    const alias = 'entity';
    const result = await manager
      .createQueryBuilder(entity, alias)
      .select(`MAX(${alias}.${column})`, 'max')
      .getRawOne<{ max: string | null }>();
    const max = result?.max ? Number(result.max) : 0;
    return max + 1;
  }
}
