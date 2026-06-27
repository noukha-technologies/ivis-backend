import { BadRequestException, Injectable } from '@nestjs/common';

import type { UserContext } from '../../../../common/dto/auth.dto';
import { PaginationQueryDto } from '../../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../../common/interfaces/pagination.interface';
import { CreateAnprCaptureDto, UpdateAnprCaptureDto } from '../../../../common/dto/anpr-capture.dto';

import { AppLogger } from '../../../../common/logger/app.logger';
import { getCreatedById } from '../../../../common/utils/created-by.util';
import { generateSnowflakeId } from '../../../../common/shared/snowflakeIdGeneration';
import { DatabaseException, DuplicateResourceException, ResourceNotFoundException } from '../../../../common/exceptions/custom.exception';

import { LineDao } from '../../../database/dao/line.dao';
import { CameraDao } from '../../../database/dao/camera.dao';
import { CustomerDao } from '../../../database/dao/customer.dao';
import { AppointmentDao } from '../../../database/dao/appointment.dao';
import { AnprCaptureDao } from '../../../database/dao/anpr-capture.dao';
import { VehicleRecordDao } from '../../../database/dao/vehicle-record.dao';

import { Camera } from '../../../database/entity/camera.entity';
import { AnprCapture } from '../../../database/entity/anpr-capture.entity';

import { AnprOrchestrationService } from './anpr-orchestration.service';
import { AnprCaptureStatus } from 'src/common/enums/camera.enums';
import { AppointmentStatus } from 'src/common/enums/common.enums';

@Injectable()
export class AnprCaptureService {
  private static readonly context = 'AnprCaptureService';

  constructor(
    private readonly logger: AppLogger,
    private readonly lineDao: LineDao,
    private readonly cameraDao: CameraDao,
    private readonly customerDao: CustomerDao,
    private readonly anprCaptureDao: AnprCaptureDao,
    private readonly appointmentDao: AppointmentDao,
    private readonly vehicleRecordDao: VehicleRecordDao,
    private readonly orchestrationService: AnprOrchestrationService,
  ) { }

  private async validateLineForCamera(lineId: string | undefined, camera: Camera): Promise<void> {
    if (!lineId) {
      return;
    }
    const line = await this.lineDao.findActiveById(lineId);
    if (!line) {
      throw new ResourceNotFoundException('Line', lineId);
    }
    if (line.centre_id !== camera.line?.centre_id) {
      throw new BadRequestException('Selected line does not belong to the camera\'s centre');
    }
  }

  async create(createDto: CreateAnprCaptureDto, actor: UserContext): Promise<AnprCapture> {
    this.logger.log(`Creating ANPR capture for plate: ${createDto.plate_number}`, AnprCaptureService.context);

    try {
      const camera = await this.cameraDao.findActiveById(createDto.camera_id);
      if (!camera) {
        throw new ResourceNotFoundException('Camera', createDto.camera_id);
      }

      await this.validateLineForCamera(createDto.line_id, camera);

      const capture = this.anprCaptureDao.create({
        id: generateSnowflakeId(),
        ...createDto,
        anpr_capture_id: await this.anprCaptureDao.getNextCaptureId(),
        capture_time: new Date(createDto.capture_time),
        created_by: getCreatedById(actor),
      });

      const saved = await this.anprCaptureDao.save(capture);
      this.orchestrationService.runPostCapture(saved);

      this.logger.log(`ANPR capture created with ID: ${saved.id}`, AnprCaptureService.context);
      return (await this.anprCaptureDao.findActiveById(saved.id)) ?? saved;
    } catch (error) {
      if (
        error instanceof DuplicateResourceException ||
        error instanceof ResourceNotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to create ANPR capture: ${(error as Error).message}`,
        (error as Error).stack,
        AnprCaptureService.context,
      );
      throw new DatabaseException('Failed to create ANPR capture. Please try again.');
    }
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<AnprCapture>> {
    this.logger.log(
      `Fetching ANPR captures — page: ${query.page}, limit: ${query.limit}`,
      AnprCaptureService.context,
    );

    try {
      return await this.anprCaptureDao.findPaginated(query);
    } catch (error) {
      this.logger.error(
        `Failed to fetch ANPR captures: ${(error as Error).message}`,
        (error as Error).stack,
        AnprCaptureService.context,
      );
      throw new DatabaseException('Failed to fetch ANPR captures. Please try again.');
    }
  }

  async findOne(id: string): Promise<AnprCapture> {
    this.logger.log(`Fetching ANPR capture ID: ${id}`, AnprCaptureService.context);
    try {
      const capture = await this.anprCaptureDao.findActiveById(id);
      if (!capture) {
        throw new ResourceNotFoundException('AnprCapture', id);
      }
      return capture;
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to fetch ANPR capture: ${(error as Error).message}`,
        (error as Error).stack,
        AnprCaptureService.context,
      );
      throw new DatabaseException('Failed to fetch ANPR capture. Please try again.');
    }
  }

  async update(id: string, updateDto: UpdateAnprCaptureDto): Promise<AnprCapture> {
    this.logger.log(`Updating ANPR capture ID: ${id}`, AnprCaptureService.context);
    try {
      const capture = await this.findOne(id);
      if (!capture) {
        throw new ResourceNotFoundException('AnprCapture', id);
      }

      const camera = await this.cameraDao.findActiveById(capture.camera_id);
      if (!camera) {
        throw new ResourceNotFoundException('Camera', capture.camera_id);
      }

      const merged = this.anprCaptureDao.merge(capture, {
        ...updateDto,
        ...(updateDto.capture_time ? { capture_time: new Date(updateDto.capture_time) } : {}),
      });
      const saved = await this.anprCaptureDao.save(merged);
      this.logger.log(`ANPR capture updated ID: ${saved.id}`, AnprCaptureService.context);
      return saved;
    } catch (error) {
      if (
        error instanceof ResourceNotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to update ANPR capture: ${(error as Error).message}`,
        (error as Error).stack,
        AnprCaptureService.context,
      );
      throw new DatabaseException('Failed to update ANPR capture. Please try again.');
    }
  }

  async validate(id: string, updateDto: UpdateAnprCaptureDto, actor: UserContext): Promise<AnprCapture> {
    this.logger.log(`Validating ANPR capture ID: ${id}`, AnprCaptureService.context);
    try {
      const capture = await this.findOne(id);

      if (!capture) {
        throw new ResourceNotFoundException('Anpr', `No data found for given ${id}`)
      }

      const merged = this.anprCaptureDao.merge(capture, {
        ...updateDto,
        ...(updateDto.capture_time ? { capture_time: new Date(updateDto.capture_time) } : {}),
        status: updateDto.status ?? AnprCaptureStatus.VALIDATED,
      });
      
      const saved = await this.anprCaptureDao.save(merged);

      // Queue an appointment only when the capture is actually validated.
      if (saved.status === AnprCaptureStatus.VALIDATED) {
        await this.ensureQueuedAppointment(saved, actor);
      }

      this.logger.log(`ANPR capture ${saved.status} ID: ${saved.id}`, AnprCaptureService.context);
      return (await this.anprCaptureDao.findActiveById(saved.id)) ?? saved;
    } catch (error) {
      if (
        error instanceof ResourceNotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to validate ANPR capture: ${(error as Error).message}`,
        (error as Error).stack,
        AnprCaptureService.context,
      );
      throw new DatabaseException('Failed to validate ANPR capture. Please try again.');
    }
  }

  private async ensureQueuedAppointment(capture: AnprCapture, actor: UserContext): Promise<void> {
    const existing = await this.appointmentDao.findByAnprCaptureId(capture.id);
    if (existing) {
      this.logger.log(
        `Appointment already exists for capture ${capture.id} — skipping`,
        AnprCaptureService.context,
      );
      return;
    }

    const plate = capture.plate_number;
    const vehicleRecord = await this.vehicleRecordDao.findByPlateNumber(plate);
    const customer = await this.customerDao.findActiveByPhone(`ANPR-${plate.slice(0, 26)}`);

    const nextId = await this.appointmentDao.getNextAppointmentId();
    const appointment = this.appointmentDao.create({
      id: generateSnowflakeId(),
      appointment_id: nextId,
      anpr_capture_id: capture.id,
      customer_id: customer?.id ?? null,
      vehicle_record_id: vehicleRecord?.id ?? null,
      plate_number: plate,
      customer_name: customer?.customer_name,
      status: AppointmentStatus.QUEUED,
      appointment_at: new Date(),
      created_by: getCreatedById(actor),
    });
    await this.appointmentDao.save(appointment);
    this.logger.log(
      `Appointment queued for capture ${capture.id}: ${appointment.id}`,
      AnprCaptureService.context,
    );
  }

  async remove(id: string): Promise<void> {
    this.logger.log(`Deleting ANPR capture ID: ${id}`, AnprCaptureService.context);
    try {
      const capture = await this.findOne(id);
      capture.is_deleted = true;
      await this.anprCaptureDao.save(capture);
      this.logger.log(`ANPR capture soft-deleted ID: ${id}`, AnprCaptureService.context);
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to delete ANPR capture: ${(error as Error).message}`,
        (error as Error).stack,
        AnprCaptureService.context,
      );
      throw new DatabaseException('Failed to delete ANPR capture. Please try again.');
    }
  }
}

