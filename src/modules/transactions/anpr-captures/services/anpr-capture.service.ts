import { BadRequestException, Injectable } from '@nestjs/common';

import type { UserContext } from '../../../../common/dto/auth.dto';
import { PaginationQueryDto } from '../../../../common/dto/pagination.dto';
import {
  CreateAnprCaptureDto,
  UpdateAnprCaptureDto,
} from '../../../../common/dto/anpr-capture.dto';

import { AnprCaptureStatus } from 'src/common/enums/camera.enums';
import { PaginatedResult } from '../../../../common/interfaces/pagination.interface';

import { AppLogger } from '../../../../common/logger/app.logger';
import { getCreatedById } from '../../../../common/utils/created-by.util';
import { generateSnowflakeId } from '../../../../common/shared/snowflakeIdGeneration';
import {
  DatabaseException,
  DuplicateResourceException,
  ResourceNotFoundException,
} from '../../../../common/exceptions/custom.exception';

import { LineDao } from '../../../database/dao/line.dao';
import { CameraDao } from '../../../database/dao/camera.dao';
import { AnprCaptureDao } from '../../../database/dao/anpr-capture.dao';

import { Camera } from '../../../database/entity/camera.entity';
import { AnprCapture } from '../../../database/entity/anpr-capture.entity';

import { AnprOrchestrationService } from './anpr-orchestration.service';
import { CaptureValidationService } from './capture-validation.service';
import { ImageProcessorService } from '../../../../common/shared/anpr/image-processor.service';
import { patchAuditContext } from '../../../../common/audit/audit-context';
import { stashAuditEntityDetails } from '../../../../common/audit/audit-entity-details.stash';

type AnprCaptureAuditState = {
  camera_id: string;
  line_id?: string | null;
  plate_number: string;
  capture_time: Date;
  plate_confidence?: number | string | null;
  direction?: string | null;
  plate_color?: string | null;
  vehicle_type?: string | null;
  vehicle_color?: string | null;
  vehicle_brand?: string | null;
  plate_size?: string | null;
  plate_type?: string | null;
  category?: string | null;
  status?: string | null;
  image_url?: string | null;
  scene_image_url?: string | null;
};

type AnprCaptureAuditDetails = AnprCaptureAuditState & {
  camera_name?: string | null;
  line_name?: string | null;
};

type AnprCaptureMediaOptions = {
  plate?: Buffer;
  scene?: Buffer;
  removePlate?: boolean;
  removeScene?: boolean;
};

@Injectable()
export class AnprCaptureService {
  private static readonly context = 'AnprCaptureService';

  constructor(
    private readonly logger: AppLogger,

    private readonly lineDao: LineDao,
    private readonly cameraDao: CameraDao,
    private readonly anprCaptureDao: AnprCaptureDao,
    private readonly imageProcessor: ImageProcessorService,
    private readonly orchestrationService: AnprOrchestrationService,
    private readonly captureValidation: CaptureValidationService,
  ) {}

  async attachImages(
    id: string,
    images: { plate?: Buffer; scene?: Buffer },
    options?: { skipAudit?: boolean },
  ): Promise<AnprCapture> {
    const capture = await this.findOne(id);

    if (!images.plate && !images.scene) {
      return capture;
    }

    try {
      const files: Record<string, Buffer> = {};
      if (images.plate) files['licensePlatePicture'] = images.plate;
      if (images.scene) files['detectionPicture'] = images.scene;

      const saved = await this.imageProcessor.saveCompressedImages(
        files,
        capture.plate_number,
      );

      const merged = this.anprCaptureDao.merge(capture, {
        ...(saved.plateImagePath ? { image_url: saved.plateImagePath } : {}),
        ...(saved.sceneImagePath
          ? { scene_image_url: saved.sceneImagePath }
          : {}),
      });
      const beforeState = this.snapshotCaptureState(capture);
      const afterState = this.snapshotCaptureState(merged);

      if (options?.skipAudit) {
        patchAuditContext({ suppressAnprCaptureAudit: true });
      } else {
        await this.applyAnprCaptureAuditContext(merged.id, beforeState, afterState);
      }
      try {
        const result = await this.anprCaptureDao.save(merged);
        this.logger.log(
          `ANPR capture images attached ID: ${result.id}`,
          AnprCaptureService.context,
        );
        return (await this.anprCaptureDao.findActiveById(result.id)) ?? result;
      } finally {
        if (options?.skipAudit) {
          patchAuditContext({ suppressAnprCaptureAudit: false });
        } else {
          this.clearAnprCaptureAuditContext();
        }
      }
    } catch (error) {
      this.logger.error(
        `Failed to attach ANPR capture images: ${(error as Error).message}`,
        (error as Error).stack,
        AnprCaptureService.context,
      );
      throw new DatabaseException(
        'Failed to upload ANPR capture images. Please try again.',
      );
    }
  }

  async removeImages(
    id: string,
    targets: { plate?: boolean; scene?: boolean },
  ): Promise<AnprCapture> {
    const capture = await this.findOne(id);

    if (!targets.plate && !targets.scene) {
      return capture;
    }

    try {
      const beforeState = this.snapshotCaptureState(capture);
      const imagePatch: Partial<AnprCapture> = {};
      if (targets.plate) {
        imagePatch.image_url = null as unknown as string;
      }
      if (targets.scene) {
        imagePatch.scene_image_url = null as unknown as string;
      }
      const merged = this.anprCaptureDao.merge(capture, imagePatch);
      const afterState = this.snapshotCaptureState(merged);
      await this.applyAnprCaptureAuditContext(merged.id, beforeState, afterState);
      try {
        const result = await this.anprCaptureDao.save(merged);
        this.logger.log(
          `ANPR capture images removed ID: ${result.id}`,
          AnprCaptureService.context,
        );
        return (await this.anprCaptureDao.findActiveById(result.id)) ?? result;
      } finally {
        this.clearAnprCaptureAuditContext();
      }
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to remove ANPR capture images: ${(error as Error).message}`,
        (error as Error).stack,
        AnprCaptureService.context,
      );
      throw new DatabaseException(
        'Failed to remove ANPR capture images. Please try again.',
      );
    }
  }

  private async validateLineForCamera(
    lineId: string | undefined,
    camera: Camera,
  ): Promise<void> {
    if (!lineId) {
      return;
    }
    const line = await this.lineDao.findActiveById(lineId);
    if (!line) {
      throw new ResourceNotFoundException('Line', lineId);
    }
    const cameraCentreId = camera.lines?.[0]?.centre?.id;
    if (cameraCentreId && line.centre_id !== cameraCentreId) {
      throw new BadRequestException(
        "Selected line does not belong to the camera's centre",
      );
    }
  }

  async create(
    createDto: CreateAnprCaptureDto,
    actor: UserContext,
  ): Promise<AnprCapture> {
    this.logger.log(
      `Creating ANPR capture for plate: ${createDto.plate_number}`,
      AnprCaptureService.context,
    );

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

      const auditDetails = await this.resolveAnprCaptureAuditDetails(
        this.snapshotCaptureState(capture),
      );
      patchAuditContext({ anprCaptureAuditDetails: { ...auditDetails } });
      stashAuditEntityDetails('AnprCapture', capture.id, {
        after: { ...auditDetails },
      });

      let saved: AnprCapture;
      try {
        saved = await this.anprCaptureDao.save(capture);
      } finally {
        this.clearAnprCaptureAuditContext();
      }
      this.orchestrationService.runPostCapture(saved);

      this.logger.log(
        `ANPR capture created with ID: ${saved.id}`,
        AnprCaptureService.context,
      );
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
      throw new DatabaseException(
        'Failed to create ANPR capture. Please try again.',
      );
    }
  }

  async findAll(
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<AnprCapture>> {
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
      throw new DatabaseException(
        'Failed to fetch ANPR captures. Please try again.',
      );
    }
  }

  async findOne(id: string): Promise<AnprCapture> {
    this.logger.log(
      `Fetching ANPR capture ID: ${id}`,
      AnprCaptureService.context,
    );
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
      throw new DatabaseException(
        'Failed to fetch ANPR capture. Please try again.',
      );
    }
  }

  async update(
    id: string,
    updateDto: UpdateAnprCaptureDto,
  ): Promise<AnprCapture> {
    this.logger.log(
      `Updating ANPR capture ID: ${id}`,
      AnprCaptureService.context,
    );
    try {
      const capture = await this.findOne(id);
      if (!capture) {
        throw new ResourceNotFoundException('AnprCapture', id);
      }

      const camera = await this.cameraDao.findActiveById(capture.camera_id);
      if (!camera) {
        throw new ResourceNotFoundException('Camera', capture.camera_id);
      }

      const beforeState = this.snapshotCaptureState(capture);
      const merged = this.anprCaptureDao.merge(capture, {
        ...updateDto,
        ...(updateDto.capture_time
          ? { capture_time: new Date(updateDto.capture_time) }
          : {}),
      });
      const afterState = this.snapshotCaptureState(merged);
      await this.applyAnprCaptureAuditContext(merged.id, beforeState, afterState);
      try {
        const saved = await this.anprCaptureDao.save(merged);
        this.logger.log(
          `ANPR capture updated ID: ${saved.id}`,
          AnprCaptureService.context,
        );
        return saved;
      } finally {
        this.clearAnprCaptureAuditContext();
      }
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
      throw new DatabaseException(
        'Failed to update ANPR capture. Please try again.',
      );
    }
  }

  async validate(
    id: string,
    updateDto: UpdateAnprCaptureDto,
    actor: UserContext,
    media?: AnprCaptureMediaOptions,
  ): Promise<AnprCapture> {
    this.logger.log(
      `Validating ANPR capture ID: ${id}`,
      AnprCaptureService.context,
    );
    try {
      const capture = await this.findOne(id);

      if (!capture) {
        throw new ResourceNotFoundException(
          'Anpr',
          `No data found for given ${id}`,
        );
      }

      // If the line is being (re)assigned, it must belong to the camera's centre.
      if (
        updateDto.line_id &&
        updateDto.line_id !== capture.line_id &&
        capture.camera
      ) {
        await this.validateLineForCamera(updateDto.line_id, capture.camera);
      }

      const beforeState = this.snapshotCaptureState(capture);
      let merged = this.anprCaptureDao.merge(capture, {
        ...updateDto,
        ...(updateDto.capture_time
          ? { capture_time: new Date(updateDto.capture_time) }
          : {}),
        status: updateDto.status ?? AnprCaptureStatus.VALIDATED,
      });
      if (
        media &&
        (media.plate ||
          media.scene ||
          media.removePlate ||
          media.removeScene)
      ) {
        merged = await this.applyImageChanges(merged, media);
      }
      const afterState = this.snapshotCaptureState(merged);
      await this.applyAnprCaptureAuditContext(merged.id, beforeState, afterState);

      let saved: AnprCapture;
      try {
        saved = await this.anprCaptureDao.save(merged);
      } finally {
        this.clearAnprCaptureAuditContext();
      }

      // Queue an appointment only when the capture is actually validated.
      if (saved.status === AnprCaptureStatus.VALIDATED) {
        await this.captureValidation.ensureQueuedAppointment(
          saved,
          getCreatedById(actor),
        );
      }

      this.logger.log(
        `ANPR capture ${saved.status} ID: ${saved.id}`,
        AnprCaptureService.context,
      );
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
      throw new DatabaseException(
        'Failed to validate ANPR capture. Please try again.',
      );
    }
  }

  async remove(id: string): Promise<void> {
    this.logger.log(
      `Deleting ANPR capture ID: ${id}`,
      AnprCaptureService.context,
    );
    try {
      const capture = await this.findOne(id);
      const auditDetails = await this.resolveAnprCaptureAuditDetails(
        this.snapshotCaptureState(capture),
      );
      patchAuditContext({ anprCaptureAuditDetails: { ...auditDetails } });
      stashAuditEntityDetails('AnprCapture', capture.id, {
        after: { ...auditDetails },
      });
      capture.is_deleted = true;
      try {
        await this.anprCaptureDao.save(capture);
      } finally {
        this.clearAnprCaptureAuditContext();
      }
      this.logger.log(
        `ANPR capture soft-deleted ID: ${id}`,
        AnprCaptureService.context,
      );
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to delete ANPR capture: ${(error as Error).message}`,
        (error as Error).stack,
        AnprCaptureService.context,
      );
      throw new DatabaseException(
        'Failed to delete ANPR capture. Please try again.',
      );
    }
  }

  private async applyImageChanges(
    capture: AnprCapture,
    media: AnprCaptureMediaOptions,
  ): Promise<AnprCapture> {
    let merged = capture;

    if (media.removePlate) {
      merged = this.anprCaptureDao.merge(merged, {
        image_url: null as unknown as string,
      });
    }
    if (media.removeScene) {
      merged = this.anprCaptureDao.merge(merged, {
        scene_image_url: null as unknown as string,
      });
    }

    if (!media.plate && !media.scene) {
      return merged;
    }

    const files: Record<string, Buffer> = {};
    if (media.plate) files['licensePlatePicture'] = media.plate;
    if (media.scene) files['detectionPicture'] = media.scene;

    const saved = await this.imageProcessor.saveCompressedImages(
      files,
      merged.plate_number,
    );

    return this.anprCaptureDao.merge(merged, {
      ...(saved.plateImagePath ? { image_url: saved.plateImagePath } : {}),
      ...(saved.sceneImagePath
        ? { scene_image_url: saved.sceneImagePath }
        : {}),
    });
  }

  private snapshotCaptureState(capture: AnprCapture): AnprCaptureAuditState {
    return {
      camera_id: capture.camera_id,
      line_id: capture.line_id ?? null,
      plate_number: capture.plate_number,
      capture_time: capture.capture_time,
      plate_confidence: capture.plate_confidence ?? null,
      direction: capture.direction ?? null,
      plate_color: capture.plate_color ?? null,
      vehicle_type: capture.vehicle_type ?? null,
      vehicle_color: capture.vehicle_color ?? null,
      vehicle_brand: capture.vehicle_brand ?? null,
      plate_size: capture.plate_size ?? null,
      plate_type: capture.plate_type ?? null,
      category: capture.category ?? null,
      status: capture.status ?? null,
      image_url: capture.image_url ?? null,
      scene_image_url: capture.scene_image_url ?? null,
    };
  }

  private async resolveAnprCaptureAuditDetails(
    state: AnprCaptureAuditState,
  ): Promise<AnprCaptureAuditDetails> {
    const camera = await this.cameraDao.findActiveById(state.camera_id);
    let lineName: string | null = null;
    if (state.line_id) {
      const line = await this.lineDao.findActiveById(state.line_id);
      lineName = line?.name ?? null;
    }

    return {
      ...state,
      camera_name: camera?.camera_name ?? null,
      line_name: lineName,
    };
  }

  private async applyAnprCaptureAuditContext(
    entityId: string,
    before: AnprCaptureAuditState,
    after: AnprCaptureAuditState,
  ): Promise<void> {
    const [beforeDetails, afterDetails] = await Promise.all([
      this.resolveAnprCaptureAuditDetails(before),
      this.resolveAnprCaptureAuditDetails(after),
    ]);
    patchAuditContext({
      anprCaptureAuditDetails: { ...afterDetails },
      anprCaptureAuditDetailsBefore: { ...beforeDetails },
    });
    stashAuditEntityDetails('AnprCapture', entityId, {
      after: { ...afterDetails },
      before: { ...beforeDetails },
    });
  }

  private clearAnprCaptureAuditContext(): void {
    patchAuditContext({
      anprCaptureAuditDetails: null,
      anprCaptureAuditDetailsBefore: null,
    });
  }
}
