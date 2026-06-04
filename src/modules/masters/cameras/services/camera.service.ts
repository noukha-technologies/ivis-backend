import { Injectable } from '@nestjs/common';
import { MasterScopeService } from '../../../../common/services/master-scope.service';
import { CreateCameraDto, UpdateCameraDto } from '../../../../common/dto/camera.dto';
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
import { Camera } from '../../../database/entity/camera.entity';
import { CameraDao } from '../../../database/dao/camera.dao';

@Injectable()
export class CameraService {
  private static readonly context = 'CameraService';

  constructor(
    private readonly cameraDao: CameraDao,
    private readonly masterScope: MasterScopeService,
    private readonly logger: AppLogger,
  ) {}

  async create(createCameraDto: CreateCameraDto, actor: UserContext): Promise<Camera> {
    this.logger.log(`Creating Camera with code: ${createCameraDto.code}`, CameraService.context);

    try {
      const existingCode = await this.cameraDao.findByCode(createCameraDto.code);
      if (existingCode) {
        throw new DuplicateResourceException('Camera', 'code', createCameraDto.code);
      }

      let camera_id = createCameraDto.camera_id;
      if (!camera_id) {
        camera_id = await this.cameraDao.getNextId();
      } else {
        const existingId = await this.cameraDao.findByCameraId(camera_id);
        if (existingId) {
          throw new DuplicateResourceException('Camera', 'camera_id', camera_id);
        }
      }

      await this.masterScope.assertLineExists(createCameraDto.line_id);
      await this.masterScope.assertLineHasNoCamera(createCameraDto.line_id);

      const camera = this.cameraDao.create({
        id: generateSnowflakeId(),
        ...createCameraDto,
        camera_id,
        status: createCameraDto.status || 'Active',
        created_by: getCreatedById(actor),
      });
      const savedCamera = await this.cameraDao.save(camera);

      this.logger.log(`Camera created with ID: ${savedCamera.id}`, CameraService.context);
      return savedCamera;
    } catch (error) {
      if (error instanceof DuplicateResourceException) {
        throw error;
      }
      this.logger.error(
        `Failed to create Camera: ${(error as Error).message}`,
        (error as Error).stack,
        CameraService.context,
      );
      throw new DatabaseException('Failed to create Camera record. Please try again.');
    }
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<Camera>> {
    this.logger.log(`Fetching Cameras — page: ${query.page}, limit: ${query.limit}`, CameraService.context);

    try {
      return await this.cameraDao.findPaginated(query);
    } catch (error) {
      this.logger.error(
        `Failed to fetch Cameras: ${(error as Error).message}`,
        (error as Error).stack,
        CameraService.context,
      );
      throw new DatabaseException('Failed to fetch Camera records. Please try again.');
    }
  }

  async findOne(id: string): Promise<Camera> {
    this.logger.log(`Fetching Camera ID: ${id}`, CameraService.context);

    try {
      const camera = await this.cameraDao.findActiveById(id);
      if (!camera) {
        throw new ResourceNotFoundException('Camera', id);
      }
      return camera;
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to fetch Camera: ${(error as Error).message}`,
        (error as Error).stack,
        CameraService.context,
      );
      throw new DatabaseException('Failed to fetch Camera record. Please try again.');
    }
  }

  async update(id: string, updateCameraDto: UpdateCameraDto): Promise<Camera> {
    this.logger.log(`Updating Camera ID: ${id}`, CameraService.context);

    try {
      const camera = await this.findOne(id);

      if (updateCameraDto.code && updateCameraDto.code !== camera.code) {
        const existingCode = await this.cameraDao.findByCode(updateCameraDto.code);
        if (existingCode) {
          throw new DuplicateResourceException('Camera', 'code', updateCameraDto.code);
        }
      }

      const targetLineId = updateCameraDto.line_id ?? camera.line_id;
      if (updateCameraDto.line_id) {
        await this.masterScope.assertLineExists(updateCameraDto.line_id);
        await this.masterScope.assertLineHasNoCamera(updateCameraDto.line_id, id);
      }

      const mergedCamera = this.cameraDao.merge(camera, {
        ...updateCameraDto,
        line_id: targetLineId,
      });
      const savedCamera = await this.cameraDao.save(mergedCamera);

      this.logger.log(`Camera updated ID: ${savedCamera.id}`, CameraService.context);
      return savedCamera;
    } catch (error) {
      if (error instanceof ResourceNotFoundException || error instanceof DuplicateResourceException) {
        throw error;
      }
      this.logger.error(
        `Failed to update Camera: ${(error as Error).message}`,
        (error as Error).stack,
        CameraService.context,
      );
      throw new DatabaseException('Failed to update Camera record. Please try again.');
    }
  }

  async remove(id: string): Promise<void> {
    this.logger.log(`Deleting Camera ID: ${id}`, CameraService.context);

    try {
      const camera = await this.findOne(id);
      camera.is_deleted = true;
      await this.cameraDao.save(camera);
      this.logger.log(`Camera soft-deleted ID: ${id}`, CameraService.context);
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to delete Camera: ${(error as Error).message}`,
        (error as Error).stack,
        CameraService.context,
      );
      throw new DatabaseException('Failed to delete Camera record. Please try again.');
    }
  }
}
