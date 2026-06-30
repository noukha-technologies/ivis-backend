import { BadRequestException, Injectable } from '@nestjs/common';

import type { UserContext } from '../../../../common/dto/auth.dto';
import { PaginationQueryDto } from '../../../../common/dto/pagination.dto';
import { CreateAnprCaptureDto, UpdateAnprCaptureDto } from '../../../../common/dto/anpr-capture.dto';

import { AnprCaptureStatus } from 'src/common/enums/camera.enums';
import { AppointmentStatus, BookingType } from 'src/common/enums/common.enums';
import { PaginatedResult } from '../../../../common/interfaces/pagination.interface';

import { AppLogger } from '../../../../common/logger/app.logger';
import { getCreatedById } from '../../../../common/utils/created-by.util';
import { generateSnowflakeId } from '../../../../common/shared/snowflakeIdGeneration';
import { DatabaseException, DuplicateResourceException, ResourceNotFoundException } from '../../../../common/exceptions/custom.exception';

import { LineDao } from '../../../database/dao/line.dao';
import { CameraDao } from '../../../database/dao/camera.dao';
import { AppointmentDao } from '../../../database/dao/appointment.dao';
import { AnprCaptureDao } from '../../../database/dao/anpr-capture.dao';
import { VehicleRecordDao } from '../../../database/dao/vehicle-record.dao';

import { Camera } from '../../../database/entity/camera.entity';
import { AnprCapture } from '../../../database/entity/anpr-capture.entity';

import { AnprOrchestrationService } from './anpr-orchestration.service';
import { ImageProcessorService } from '../../../../common/shared/anpr/image-processor.service';
import { OnlineAppointmentApiClientService } from '../../../integrations/online-appointment/online-appointment-api-client.service';

@Injectable()
export class AnprCaptureService {
  private static readonly context = 'AnprCaptureService';

  constructor(
    private readonly logger: AppLogger,

    private readonly lineDao: LineDao,
    private readonly cameraDao: CameraDao,
    private readonly anprCaptureDao: AnprCaptureDao,
    private readonly appointmentDao: AppointmentDao,
    private readonly vehicleRecordDao: VehicleRecordDao,
    private readonly imageProcessor: ImageProcessorService,
    private readonly orchestrationService: AnprOrchestrationService,
    private readonly onlineAppointmentApi: OnlineAppointmentApiClientService,
  ) { }

  async attachImages(
    id: string,
    images: { plate?: Buffer; scene?: Buffer },
  ): Promise<AnprCapture> {
    const capture = await this.findOne(id);

    if (!images.plate && !images.scene) {
      return capture;
    }

    try {
      const files: Record<string, Buffer> = {};
      if (images.plate) files['licensePlatePicture'] = images.plate;
      if (images.scene) files['detectionPicture'] = images.scene;

      const saved = await this.imageProcessor.saveCompressedImages(files, capture.plate_number);

      const merged = this.anprCaptureDao.merge(capture, {
        ...(saved.plateImagePath ? { image_url: saved.plateImagePath } : {}),
        ...(saved.sceneImagePath ? { scene_image_url: saved.sceneImagePath } : {}),
      });
      const result = await this.anprCaptureDao.save(merged);
      this.logger.log(`ANPR capture images attached ID: ${result.id}`, AnprCaptureService.context);
      return (await this.anprCaptureDao.findActiveById(result.id)) ?? result;
    } catch (error) {
      this.logger.error(
        `Failed to attach ANPR capture images: ${(error as Error).message}`,
        (error as Error).stack,
        AnprCaptureService.context,
      );
      throw new DatabaseException('Failed to upload ANPR capture images. Please try again.');
    }
  }

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

      // If the line is being (re)assigned, it must belong to the camera's centre.
      if (updateDto.line_id && updateDto.line_id !== capture.line_id && capture.camera) {
        await this.validateLineForCamera(updateDto.line_id, capture.camera);
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

    // Carry the capture's line (and its centre) onto the appointment so the queue
    // shows Centre / Line. The chosen line's centre is resolved from the line master.
    const line = capture.line_id ? await this.lineDao.findActiveById(capture.line_id) : null;

    // Check the third-party online appointment API by plate: if the plate is a
    // pre-booked online appointment, mark it Online (and use that data); otherwise
    // it's a direct Walk-in. (Returns null until the integration is configured.)
    const online = await this.onlineAppointmentApi.findByPlate(plate);

    const nextId = await this.appointmentDao.getNextAppointmentId();
    const appointment = this.appointmentDao.create({
      id: generateSnowflakeId(),
      appointment_id: nextId,
      anpr_capture_id: capture.id,
      customer_id: null,
      vehicle_record_id: vehicleRecord?.id ?? null,
      centre_id: line?.centre_id ?? null,
      line_id: capture.line_id ?? null,
      plate_number: plate,
      booking_type: online ? BookingType.ONLINE : BookingType.WALK_IN,
      customer_name: online?.customer_name,
      customer_phone: online?.customer_phone,
      id_number: online?.id_number,
      vehicle_type: online?.vehicle_type,
      status: AppointmentStatus.QUEUED,
      appointment_at: online?.appointment_at ? new Date(online.appointment_at) : new Date(),
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

