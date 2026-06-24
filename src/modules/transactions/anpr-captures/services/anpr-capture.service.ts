import { Injectable } from '@nestjs/common';

import type { UserContext } from '../../../../common/dto/auth.dto';
import { PaginationQueryDto } from '../../../../common/dto/pagination.dto';
import { CreateAnprCaptureDto, UpdateAnprCaptureDto } from '../../../../common/dto/anpr-capture.dto';

import { PaginatedResult } from '../../../../common/interfaces/pagination.interface';

import { AppLogger } from '../../../../common/logger/app.logger';
import { getCreatedById } from '../../../../common/utils/created-by.util';
import { generateSnowflakeId } from '../../../../common/shared/snowflakeIdGeneration';
import { DatabaseException, DuplicateResourceException, ResourceNotFoundException } from '../../../../common/exceptions/custom.exception';

import { CameraDao } from '../../../database/dao/camera.dao';
import { AnprCaptureDao } from '../../../database/dao/anpr-capture.dao';

import { AnprCapture } from '../../../database/entity/anpr-capture.entity';

@Injectable()
export class AnprCaptureService {
  private static readonly context = 'AnprCaptureService';

  constructor(
    private readonly logger: AppLogger,
    private readonly cameraDao: CameraDao,
    private readonly anprCaptureDao: AnprCaptureDao,
  ) { }

  async create(createDto: CreateAnprCaptureDto, actor: UserContext): Promise<AnprCapture> {
    this.logger.log(`Creating ANPR capture for plate: ${createDto.plate_number}`, AnprCaptureService.context);

    try {
      const camera = await this.cameraDao.findActiveById(createDto.camera_id);
      if (!camera) {
        throw new ResourceNotFoundException('Camera', createDto.camera_id);
      }

      let captureId = createDto.capture_id;
      if (!captureId) {
        captureId = await this.anprCaptureDao.getNextCaptureId();
      } else {
        const existing = await this.anprCaptureDao.findByCaptureId(captureId);
        if (existing) {
          throw new DuplicateResourceException('AnprCapture', 'capture_id', captureId);
        }
      }

      const capture = this.anprCaptureDao.create({
        id: generateSnowflakeId(),
        ...createDto,
        anpr_capture_id: captureId,
        capture_time: new Date(createDto.capture_time),
        created_by: getCreatedById(actor),
      });
      const saved = await this.anprCaptureDao.save(capture);

      this.logger.log(`ANPR capture created with ID: ${saved.id}`, AnprCaptureService.context);
      return (await this.anprCaptureDao.findActiveById(saved.id)) ?? saved;
    } catch (error) {
      if (
        error instanceof DuplicateResourceException ||
        error instanceof ResourceNotFoundException
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

      if (updateDto.camera_id) {
        const camera = await this.cameraDao.findActiveById(updateDto.camera_id);
        if (!camera) {
          throw new ResourceNotFoundException('Camera', updateDto.camera_id);
        }
      }

      const merged = this.anprCaptureDao.merge(capture, {
        ...updateDto,
        ...(updateDto.capture_time ? { capture_time: new Date(updateDto.capture_time) } : {}),
      });
      const saved = await this.anprCaptureDao.save(merged);
      this.logger.log(`ANPR capture updated ID: ${saved.id}`, AnprCaptureService.context);
      return saved;
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
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

