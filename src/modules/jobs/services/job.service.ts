import { BadRequestException, Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import { CreateJobDto, UpdateJobDto } from '../../../common/dto/job.dto';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../common/interfaces/pagination.interface';
import {
  DatabaseException,
  DuplicateResourceException,
  ResourceNotFoundException,
} from '../../../common/exceptions/custom.exception';
import { AppLogger } from '../../../common/logger/app.logger';
import type { UserContext } from '../../../common/dto/auth.dto';
import { getCreatedById } from '../../../common/utils/created-by.util';
import { generateSnowflakeId } from '../../../common/shared/snowflakeIdGeneration';
import { AppointmentStatus } from '../../../common/enums/common.enums';
import { AdminPcDao } from '../../database/dao/admin-pc.dao';
import { AnprCaptureDao } from '../../database/dao/anpr-capture.dao';
import { AppointmentDao } from '../../database/dao/appointment.dao';
import { CameraDao } from '../../database/dao/camera.dao';
import { CentreDao } from '../../database/dao/centre.dao';
import { ChargeDao } from '../../database/dao/charge.dao';
import { CustomerDao } from '../../database/dao/customer.dao';
import { JobDao } from '../../database/dao/job.dao';
import { JobImageDao } from '../../database/dao/job-image.dao';
import { LineDao } from '../../database/dao/line.dao';
import { PaymentsDao } from '../../database/dao/payments.dao';
import { VehicleRecordDao } from '../../database/dao/vehicle-record.dao';
import { PaymentApiClientService } from '../../integrations/payment/payment-api-client.service';
import { RopApiClientService } from '../../integrations/rop/rop-api-client.service';
import { InfileGeneratorService } from './infile-generator.service';
import { Job } from '../../database/entity/job.entity';
import { Charge } from '../../database/entity/charge.entity';

/** Resolved invoice pricing for a job (Invoice Details stage). */
export interface JobPricingResult {
  charge_missing: boolean;
  vehicle_type: string | null;
  charge_category_id: string | null;
  center_charges: number;
  rop_charges: number;
  vat_percent: number;
  grand_total: number;
  advance: number;
  payable: number;
  /** The payments_id that will be generated for this job's next payment. */
  next_payment_id: number;
}

@Injectable()
export class JobService {
  private static readonly context = 'JobService';

  constructor(
    private readonly jobDao: JobDao,
    private readonly jobImageDao: JobImageDao,
    private readonly customerDao: CustomerDao,
    private readonly vehicleRecordDao: VehicleRecordDao,
    private readonly appointmentDao: AppointmentDao,
    private readonly anprCaptureDao: AnprCaptureDao,
    private readonly chargeDao: ChargeDao,
    private readonly centreDao: CentreDao,
    private readonly lineDao: LineDao,
    private readonly adminPcDao: AdminPcDao,
    private readonly cameraDao: CameraDao,
    private readonly paymentsDao: PaymentsDao,
    private readonly paymentApi: PaymentApiClientService,
    private readonly ropApi: RopApiClientService,
    private readonly infileGenerator: InfileGeneratorService,
    private readonly logger: AppLogger,
  ) {}

  private isSameOmanDay(a: Date, b: Date): boolean {
    const fmt = (d: Date) =>
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Muscat',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(d);
    return fmt(a) === fmt(b);
  }

  /** Submit & Print — submit the result to ROP (same-day only) and complete. */
  async submitJob(id: string): Promise<Job> {
    const job = await this.findOne(id);
    if (!this.isSameOmanDay(new Date(job.created_at), new Date())) {
      throw new BadRequestException(
        'ROP submission must be on the same day the job was created',
      );
    }
    await this.ropApi.submitInspection(
      job.vehicleRecord?.plate_number ?? '',
      job.overall_result ?? 'Passed',
    );
    return this.update(id, {
      status: 'Completed',
      completed_at: new Date().toISOString(),
    });
  }

  /** Redo Test — flag the job's overall result as Redo. */
  async redoJob(id: string): Promise<Job> {
    return this.update(id, { overall_result: 'Redo' });
  }

  /**
   * Start the inspection: generate the IN file to the Admin PC folder and move
   * the job to In Progress (records IN file name/path + started_at).
   */
  async startJob(id: string): Promise<Job> {
    const job = await this.findOne(id);
    const { name, path } = await this.infileGenerator.generateForJob(job);
    return this.update(id, {
      status: 'In Progress',
      infile_name: name,
      infile_path: path,
      started_at: new Date().toISOString(),
    });
  }

  async create(createDto: CreateJobDto, actor: UserContext): Promise<Job> {
    this.logger.log(
      `Creating job for customer: ${createDto.customer_id}`,
      JobService.context,
    );

    try {
      await this.validateJobReferences(createDto);

      let jobId = createDto.job_id;
      if (!jobId) {
        jobId = await this.jobDao.getNextJobId();
      } else {
        const existing = await this.jobDao.findByJobId(jobId);
        if (existing) {
          throw new DuplicateResourceException('Job', 'job_id', jobId);
        }
      }

      const job = this.jobDao.create({
        id: generateSnowflakeId(),
        job_id: jobId,
        appointment_id: createDto.appointment_id ?? null,
        status: createDto.status || 'Pending',
        customer_id: createDto.customer_id,
        vehicle_record_id: createDto.vehicle_record_id,
        anpr_capture_id: createDto.anpr_capture_id,
        centre_id: createDto.centre_id,
        line_id: createDto.line_id,
        admin_pc_id: createDto.admin_pc_id,
        camera_id: createDto.camera_id,
        created_by: getCreatedById(actor),
      });

      const saved = await this.jobDao.save(job);
      this.logger.log(`Job created with ID: ${saved.id}`, JobService.context);
      return (await this.jobDao.findActiveById(saved.id)) ?? saved;
    } catch (error) {
      if (
        error instanceof DuplicateResourceException ||
        error instanceof ResourceNotFoundException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to create job: ${(error as Error).message}`,
        (error as Error).stack,
        JobService.context,
      );
      throw new DatabaseException('Failed to create job. Please try again.');
    }
  }

  /**
   * Create a Job from a queued walk-in appointment. Requires the appointment to
   * already have a linked customer (operator entered details). Ensures a vehicle
   * record exists (by plate), creates the job (Pending), and marks the
   * appointment Converted.
   */
  async createFromAppointment(
    appointmentId: string,
    actor: UserContext,
  ): Promise<Job> {
    this.logger.log(
      `Converting appointment ${appointmentId} to a job`,
      JobService.context,
    );

    const appt = await this.appointmentDao.findActiveById(appointmentId);
    if (!appt) {
      throw new ResourceNotFoundException('Appointment', appointmentId);
    }
    if (appt.status === AppointmentStatus.CONVERTED) {
      throw new BadRequestException(
        'Appointment has already been converted to a job',
      );
    }
    if (!appt.customer_id) {
      throw new BadRequestException(
        'Enter customer details before converting to a job',
      );
    }

    // Ensure a vehicle record exists for the plate (jobs require one). Plate +
    // vehicle type are read from the appointment's relations (record / ANPR).
    let vehicleRecordId = appt.vehicle_record_id ?? null;
    if (!vehicleRecordId) {
      const plate = (
        appt.vehicleRecord?.plate_number ?? appt.anprCapture?.plate_number
      )?.trim();
      if (!plate) {
        throw new BadRequestException('Appointment has no plate number');
      }
      let record = await this.vehicleRecordDao.findByPlateNumber(plate);
      if (!record) {
        record = await this.vehicleRecordDao.save(
          this.vehicleRecordDao.create({
            id: generateSnowflakeId(),
            vehicle_record_id:
              await this.vehicleRecordDao.getNextVehicleRecordId(),
            plate_number: plate,
            vehicle_type:
              appt.vehicleRecord?.vehicle_type ??
              appt.anprCapture?.vehicle_type ??
              undefined,
            created_by: getCreatedById(actor),
          }),
        );
      }
      vehicleRecordId = record.id;
    }

    const resolvedCentreId =
      appt.centre_id ?? actor.user.center_id ?? undefined;

    const job = await this.create(
      {
        appointment_id: appt.id,
        status: 'Pending',
        customer_id: appt.customer_id,
        vehicle_record_id: vehicleRecordId,
        centre_id: resolvedCentreId,
        line_id: appt.line_id ?? undefined,
        anpr_capture_id: appt.anpr_capture_id ?? undefined,
      },
      actor,
    );

    await this.appointmentDao.save(
      this.appointmentDao.merge(appt, { status: AppointmentStatus.CONVERTED }),
    );

    return job;
  }

  /**
   * Resolve invoice pricing for a job from the Charges master, keyed by
   * (centre, vehicle_type, charge_category). Returns `charge_missing: true` with
   * zeroed amounts when no matching charge exists (the FE blocks + warns).
   * Advance currently 0 (wired to the payment API in a later milestone).
   */
  async resolvePricing(id: string): Promise<JobPricingResult> {
    const job = await this.findOne(id);
    return this.resolvePricingForJob(job);
  }

  /**
   * Resolve the payment for a job from the configured charges, filtered by the
   * job's vehicle type (lowercased). Uses the (centre, vehicle_type, category)
   * combo when a charge category is known, otherwise falls back to matching by
   * vehicle type alone. Returned inline on job create / get responses.
   */
  async resolvePricingForJob(job: Job): Promise<JobPricingResult> {
    const rawVehicleType =
      job.vehicleRecord?.vehicle_type ??
      job.vehicleRecord?.vehicleMaster?.vehicle_type ??
      null;
    const vehicleType = rawVehicleType
      ? rawVehicleType.trim().toLowerCase()
      : null;
    const chargeCategoryId =
      job.vehicleRecord?.vehicleMaster?.charge_category_id ?? null;

    const nextPaymentId = await this.paymentsDao.getNextPaymentsId();

    let charge: Charge | null = null;
    if (vehicleType) {
      charge = chargeCategoryId
        ? await this.chargeDao.findByCombo(
            job.centre_id ?? undefined,
            vehicleType,
            chargeCategoryId,
          )
        : null;
      // Fallback: match by vehicle type alone (e.g. walk-ins with no category).
      charge ??= await this.chargeDao.findByVehicleType(
        job.centre_id ?? undefined,
        vehicleType,
      );
    }

    if (!charge) {
      return {
        charge_missing: true,
        vehicle_type: vehicleType,
        charge_category_id: chargeCategoryId,
        center_charges: 0,
        rop_charges: 0,
        vat_percent: 0,
        grand_total: 0,
        advance: 0,
        payable: 0,
        next_payment_id: nextPaymentId,
      };
    }

    const grandTotal = Number(charge.grand_total);
    // Advance already collected (from the third-party payment API; 0 until wired).
    const plate = job.vehicleRecord?.plate_number;
    const paymentInfo = plate
      ? await this.paymentApi.fetchByPlate(plate)
      : null;
    const advance = paymentInfo?.advance ?? 0;
    return {
      charge_missing: false,
      vehicle_type: vehicleType,
      charge_category_id: chargeCategoryId,
      center_charges: Number(charge.center_charges),
      rop_charges: Number(charge.rop_charges),
      vat_percent: Number(charge.vat_percent),
      grand_total: grandTotal,
      advance,
      payable: Math.max(0, grandTotal - advance),
      next_payment_id: nextPaymentId,
    };
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<Job>> {
    this.logger.log(
      `Fetching jobs — page: ${query.page}, limit: ${query.limit}`,
      JobService.context,
    );

    try {
      return await this.jobDao.findPaginated(query);
    } catch (error) {
      this.logger.error(
        `Failed to fetch jobs: ${(error as Error).message}`,
        (error as Error).stack,
        JobService.context,
      );
      throw new DatabaseException('Failed to fetch jobs. Please try again.');
    }
  }

  async findOne(id: string): Promise<Job> {
    this.logger.log(`Fetching job ID: ${id}`, JobService.context);

    try {
      const job = await this.jobDao.findActiveById(id);
      if (!job) {
        throw new ResourceNotFoundException('Job', id);
      }
      job.images = await this.jobImageDao.findByJobId(id);
      return job;
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to fetch job: ${(error as Error).message}`,
        (error as Error).stack,
        JobService.context,
      );
      throw new DatabaseException('Failed to fetch job. Please try again.');
    }
  }

  /** Raw IN file contents for the Test & Submit preview modal. */
  async getInFileContent(id: string): Promise<string> {
    const job = await this.findOne(id);

    if (!job.infile_path) {
      throw new BadRequestException(
        'IN file has not been generated yet — start the job first.',
      );
    }

    try {
      return await fs.readFile(job.infile_path, 'utf8');
    } catch (error) {
      this.logger.error(
        `Failed to read IN file at ${job.infile_path}: ${(error as Error).message}`,
        (error as Error).stack,
        JobService.context,
      );
      throw new BadRequestException(
        'IN file could not be read from disk — it may have been moved or the share is unavailable.',
      );
    }
  }

  async update(id: string, updateDto: UpdateJobDto): Promise<Job> {
    this.logger.log(`Updating job ID: ${id}`, JobService.context);

    try {
      const job = await this.findOne(id);
      await this.validateJobReferences(updateDto);

      const merged = this.jobDao.merge(job, {
        ...updateDto,
        ...(updateDto.started_at
          ? { started_at: new Date(updateDto.started_at) }
          : {}),
        ...(updateDto.completed_at
          ? { completed_at: new Date(updateDto.completed_at) }
          : {}),
        ...(updateDto.invoice_date
          ? { invoice_date: new Date(updateDto.invoice_date) }
          : {}),
      });

      const saved = await this.jobDao.save(merged);
      this.logger.log(`Job updated ID: ${saved.id}`, JobService.context);
      return (await this.jobDao.findActiveById(saved.id)) ?? saved;
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to update job: ${(error as Error).message}`,
        (error as Error).stack,
        JobService.context,
      );
      throw new DatabaseException('Failed to update job. Please try again.');
    }
  }

  async remove(id: string): Promise<void> {
    this.logger.log(`Deleting job ID: ${id}`, JobService.context);

    try {
      const job = await this.findOne(id);
      job.is_deleted = true;
      await this.jobDao.save(job);
      this.logger.log(`Job soft-deleted ID: ${id}`, JobService.context);
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to delete job: ${(error as Error).message}`,
        (error as Error).stack,
        JobService.context,
      );
      throw new DatabaseException('Failed to delete job. Please try again.');
    }
  }

  private async validateJobReferences(
    dto: Partial<
      Pick<
        CreateJobDto,
        | 'customer_id'
        | 'vehicle_record_id'
        | 'anpr_capture_id'
        | 'centre_id'
        | 'line_id'
        | 'admin_pc_id'
        | 'camera_id'
      >
    >,
  ): Promise<void> {
    if (dto.customer_id) {
      const customer = await this.customerDao.findActiveById(dto.customer_id);
      if (!customer) {
        throw new ResourceNotFoundException('Customer', dto.customer_id);
      }
    }

    if (dto.vehicle_record_id) {
      const vehicleRecord = await this.vehicleRecordDao.findActiveById(
        dto.vehicle_record_id,
      );
      if (!vehicleRecord) {
        throw new ResourceNotFoundException(
          'VehicleRecord',
          dto.vehicle_record_id,
        );
      }
    }

    if (dto.anpr_capture_id) {
      const anprCapture = await this.anprCaptureDao.findActiveById(
        dto.anpr_capture_id,
      );
      if (!anprCapture) {
        throw new ResourceNotFoundException('AnprCapture', dto.anpr_capture_id);
      }
    }

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
}
