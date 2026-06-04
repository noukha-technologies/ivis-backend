import { Injectable } from '@nestjs/common';
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
import { AdminPcDao } from '../../database/dao/admin-pc.dao';
import { AnprCaptureDao } from '../../database/dao/anpr-capture.dao';
import { CameraDao } from '../../database/dao/camera.dao';
import { CentreDao } from '../../database/dao/centre.dao';
import { CustomerDao } from '../../database/dao/customer.dao';
import { JobDao } from '../../database/dao/job.dao';
import { LineDao } from '../../database/dao/line.dao';
import { VehicleRecordDao } from '../../database/dao/vehicle-record.dao';
import { Job } from '../../database/entity/job.entity';

@Injectable()
export class JobService {
  private static readonly context = 'JobService';

  constructor(
    private readonly jobDao: JobDao,
    private readonly customerDao: CustomerDao,
    private readonly vehicleRecordDao: VehicleRecordDao,
    private readonly anprCaptureDao: AnprCaptureDao,
    private readonly centreDao: CentreDao,
    private readonly lineDao: LineDao,
    private readonly adminPcDao: AdminPcDao,
    private readonly cameraDao: CameraDao,
    private readonly logger: AppLogger,
  ) {}

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
        source: createDto.source,
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

  async update(id: string, updateDto: UpdateJobDto): Promise<Job> {
    this.logger.log(`Updating job ID: ${id}`, JobService.context);

    try {
      const job = await this.findOne(id);
      await this.validateJobReferences(updateDto);

      const merged = this.jobDao.merge(job, {
        ...updateDto,
        ...(updateDto.started_at ? { started_at: new Date(updateDto.started_at) } : {}),
        ...(updateDto.completed_at ? { completed_at: new Date(updateDto.completed_at) } : {}),
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
      const vehicleRecord = await this.vehicleRecordDao.findActiveById(dto.vehicle_record_id);
      if (!vehicleRecord) {
        throw new ResourceNotFoundException('VehicleRecord', dto.vehicle_record_id);
      }
    }

    if (dto.anpr_capture_id) {
      const anprCapture = await this.anprCaptureDao.findActiveById(dto.anpr_capture_id);
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
