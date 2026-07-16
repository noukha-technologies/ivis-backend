import { Injectable } from '@nestjs/common';
import {
  DatabaseException,
  DuplicateResourceException,
  ResourceNotFoundException,
} from '../../../../common/exceptions/custom.exception';

import type { UserContext } from '../../../../common/dto/auth.dto';
import { PaginationQueryDto } from '../../../../common/dto/pagination.dto';
import {
  CreateCameraDto,
  UpdateCameraDto,
} from '../../../../common/dto/camera.dto';
import { PaginatedResult } from '../../../../common/interfaces/pagination.interface';

import { Camera } from '../../../database/entity/camera.entity';
import { AppLogger } from '../../../../common/logger/app.logger';
import { getCreatedById } from '../../../../common/utils/created-by.util';
import { generateSnowflakeId } from '../../../../common/shared/snowflakeIdGeneration';

import { CameraDao } from '../../../database/dao/camera.dao';
import { CameraLineMappingDao } from '../../../database/dao/camera-line-mapping.dao';
import { MasterScopeService } from '../../../../common/services/master-scope.service';
import { patchAuditContext } from '../../../../common/audit/audit-context';

function asAuditBag(
  entity: object,
): Record<string, unknown> {
  return entity as unknown as Record<string, unknown>;
}

function cleanIpAddress(ip: string): string {
  if (!ip) return ip;
  const trimmed = ip.trim();
  if (trimmed.includes('://')) {
    try {
      const parsed = new URL(trimmed);
      return parsed.hostname;
    } catch {
      return trimmed
        .replace(/^https?:\/\//i, '')
        .split('/')[0]
        .split(':')[0];
    }
  }
  return trimmed.split(':')[0];
}

@Injectable()
export class CameraService {
  private static readonly context = 'CameraService';

  constructor(
    private readonly logger: AppLogger,
    private readonly cameraDao: CameraDao,
    private readonly cameraLineMappingDao: CameraLineMappingDao,
    private readonly masterScope: MasterScopeService,
  ) {}

  private normalizeLineIds(dto: { line_ids?: string[]; line_id?: string }): string[] {
    const ids = dto.line_ids ?? (dto.line_id ? [dto.line_id] : []);
    return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  }

  private sameLineIds(a: string[], b: string[]): boolean {
    const norm = (ids: string[]) =>
      [...new Set(ids.map((id) => id.trim()).filter(Boolean))].sort();
    const left = norm(a);
    const right = norm(b);
    return (
      left.length === right.length && left.every((id, index) => id === right[index])
    );
  }

  async create(
    createCameraDto: CreateCameraDto,
    actor: UserContext,
  ): Promise<Camera> {
    this.logger.log(
      `Creating Camera with code: ${createCameraDto.code}`,
      CameraService.context,
    );

    try {
      const existingCode = await this.cameraDao.findByCode(
        createCameraDto.code,
      );
      if (existingCode) {
        throw new DuplicateResourceException(
          'Camera',
          'code',
          createCameraDto.code,
        );
      }

      let camera_id = createCameraDto.camera_id;
      if (!camera_id) {
        camera_id = await this.cameraDao.getNextId();
      } else {
        const existingId = await this.cameraDao.findByCameraId(camera_id);
        if (existingId) {
          throw new DuplicateResourceException(
            'Camera',
            'camera_id',
            camera_id,
          );
        }
      }

      const lineIds = this.normalizeLineIds(createCameraDto);
      for (const lineId of lineIds) {
        await this.masterScope.assertLineExists(lineId);
      }
      await this.masterScope.assertLinesHaveNoCamera(lineIds);

      const {
        line_ids: _lineIds,
        line_id: _lineId,
        ...cameraFields
      } = createCameraDto;

      const camera = this.cameraDao.create({
        id: generateSnowflakeId(),
        ...cameraFields,
        ip_address: cleanIpAddress(createCameraDto.ip_address),
        camera_id,
        status: createCameraDto.status || 'Active',
        created_by: getCreatedById(actor),
      });
      // Virtual field — include Line(s) in the CREATE audit snapshot.
      camera.line_ids = lineIds;
      const savedCamera = await this.cameraDao.save(camera);

      await this.cameraLineMappingDao.replaceForCamera(
        savedCamera.id,
        lineIds,
        getCreatedById(actor),
      );

      this.logger.log(
        `Camera created with ID: ${savedCamera.id}`,
        CameraService.context,
      );
      return (await this.cameraDao.findActiveById(savedCamera.id)) ?? savedCamera;
    } catch (error) {
      if (error instanceof DuplicateResourceException) {
        throw error;
      }
      this.logger.error(
        `Failed to create Camera: ${(error as Error).message}`,
        (error as Error).stack,
        CameraService.context,
      );
      throw new DatabaseException(
        'Failed to create Camera record. Please try again.',
      );
    }
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<Camera>> {
    this.logger.log(
      `Fetching Cameras — page: ${query.page}, limit: ${query.limit}`,
      CameraService.context,
    );

    try {
      return await this.cameraDao.findPaginated(query);
    } catch (error) {
      this.logger.error(
        `Failed to fetch Cameras: ${(error as Error).message}`,
        (error as Error).stack,
        CameraService.context,
      );
      throw new DatabaseException(
        'Failed to fetch Camera records. Please try again.',
      );
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
      throw new DatabaseException(
        'Failed to fetch Camera record. Please try again.',
      );
    }
  }

  async update(id: string, updateCameraDto: UpdateCameraDto): Promise<Camera> {
    this.logger.log(`Updating Camera ID: ${id}`, CameraService.context);

    try {
      const camera = await this.findOne(id);

      if (updateCameraDto.code && updateCameraDto.code !== camera.code) {
        const existingCode = await this.cameraDao.findByCode(
          updateCameraDto.code,
        );
        if (existingCode) {
          throw new DuplicateResourceException(
            'Camera',
            'code',
            updateCameraDto.code,
          );
        }
      }

      const lineIdsBefore = [...(camera.line_ids ?? [])];
      const requestedLineIds =
        updateCameraDto.line_ids !== undefined ||
        updateCameraDto.line_id !== undefined
          ? this.normalizeLineIds(updateCameraDto)
          : null;
      const linesChanged =
        requestedLineIds !== null &&
        !this.sameLineIds(requestedLineIds, lineIdsBefore);
      let nextLineIds = lineIdsBefore;
      if (linesChanged && requestedLineIds) {
        for (const lineId of requestedLineIds) {
          await this.masterScope.assertLineExists(lineId);
        }
        await this.masterScope.assertLinesHaveNoCamera(requestedLineIds, id);
        await this.cameraLineMappingDao.replaceForCamera(
          id,
          requestedLineIds,
          camera.created_by,
        );
        nextLineIds = requestedLineIds;
      }

      const {
        line_ids: _lineIds,
        line_id: _lineId,
        ...updateFields
      } = updateCameraDto;

      const passwordChanged =
        updateCameraDto.password !== undefined &&
        updateCameraDto.password !== (camera.password ?? '');

      const mergedCamera = this.cameraDao.merge(camera, {
        ...updateFields,
        ip_address: updateCameraDto.ip_address
          ? cleanIpAddress(updateCameraDto.ip_address)
          : camera.ip_address,
      });
      if (linesChanged) {
        mergedCamera.line_ids = nextLineIds;
        asAuditBag(mergedCamera).__auditLineIdsBefore = lineIdsBefore;
      } else {
        delete mergedCamera.line_ids;
        delete mergedCamera.lines;
      }
      if (passwordChanged) {
        // Request-scoped flag (entity props are stripped by TypeORM).
        patchAuditContext({ passwordChanged: true });
      }
      try {
        const savedCamera = await this.cameraDao.save(mergedCamera);
        this.logger.log(
          `Camera updated ID: ${savedCamera.id}`,
          CameraService.context,
        );
        return (
          (await this.cameraDao.findActiveById(savedCamera.id)) ?? savedCamera
        );
      } finally {
        patchAuditContext({ passwordChanged: false });
      }
    } catch (error) {
      if (
        error instanceof ResourceNotFoundException ||
        error instanceof DuplicateResourceException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to update Camera: ${(error as Error).message}`,
        (error as Error).stack,
        CameraService.context,
      );
      throw new DatabaseException(
        'Failed to update Camera record. Please try again.',
      );
    }
  }

  async remove(id: string): Promise<void> {
    this.logger.log(`Deleting Camera ID: ${id}`, CameraService.context);

    try {
      const camera = await this.findOne(id);
      camera.is_deleted = true;
      await this.cameraDao.save(camera);
      await this.cameraLineMappingDao.softDeleteByCameraId(id);
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
      throw new DatabaseException(
        'Failed to delete Camera record. Please try again.',
      );
    }
  }
}
