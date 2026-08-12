import { Injectable } from '@nestjs/common';
import {
  CreateRopVerificationDto,
  UpdateRopVerificationDto,
} from '../../../../common/dto/rop-verification.dto';
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
import { RopVerificationStatus } from '../../../../common/enums/common.enums';
import { AnprCaptureDao } from '../../../database/dao/anpr-capture.dao';
import { RopVerificationDao } from '../../../database/dao/rop-verification.dao';
import { RopVerification } from '../../../database/entity/rop-verification.entity';
import { CaptureValidationService } from '../../anpr-captures/services/capture-validation.service';
import {
  applyRopVerificationAuditContext,
  clearRopVerificationAuditContext,
  EMPTY_ROP_VERIFICATION_AUDIT,
  snapshotRopVerification,
} from '../../../../common/audit/rop-verification-audit';

@Injectable()
export class RopVerificationService {
  private static readonly context = 'RopVerificationService';

  constructor(
    private readonly ropVerificationDao: RopVerificationDao,
    private readonly anprCaptureDao: AnprCaptureDao,
    private readonly captureValidation: CaptureValidationService,
    private readonly logger: AppLogger,
  ) {}

  private async resolvePlateNumber(
    anprCaptureId: string | null | undefined,
  ): Promise<string | null> {
    if (!anprCaptureId) return null;
    const capture = await this.anprCaptureDao.findActiveById(anprCaptureId);
    return capture?.plate_number ?? null;
  }

  /**
   * When a ROP verification is "Fetched", validate the linked capture and queue
   * the appointment (same pipeline as the automatic ROP fetch). No-op otherwise.
   */
  private async syncCaptureFromRop(rop: RopVerification): Promise<void> {
    if (
      rop.fetch_status !== RopVerificationStatus.VALIDATED ||
      !rop.anpr_capture_id
    ) {
      return;
    }
    const capture = await this.anprCaptureDao.findActiveById(
      rop.anpr_capture_id,
    );
    if (!capture) {
      return;
    }
    await this.captureValidation.applyRopFetched(
      capture,
      rop,
      rop.created_by ?? 'operator',
    );
  }

  async create(
    createDto: CreateRopVerificationDto,
    actor: UserContext,
  ): Promise<RopVerification> {
    this.logger.log(
      `Creating ROP verification for ANPR capture: ${createDto.anpr_capture_id}`,
      RopVerificationService.context,
    );

    try {
      const anprCapture = await this.anprCaptureDao.findActiveById(
        createDto.anpr_capture_id,
      );
      if (!anprCapture) {
        throw new ResourceNotFoundException(
          'AnprCapture',
          createDto.anpr_capture_id,
        );
      }

      let ropVerificationId = createDto.rop_verification_id;
      if (!ropVerificationId) {
        ropVerificationId =
          await this.ropVerificationDao.getNextRopVerificationId();
      } else {
        const existing =
          await this.ropVerificationDao.findByRopVerificationId(
            ropVerificationId,
          );
        if (existing) {
          throw new DuplicateResourceException(
            'RopVerification',
            'rop_verification_id',
            ropVerificationId,
          );
        }
      }

      const fetchStatus =
        createDto.fetch_status || RopVerificationStatus.VALIDATED;
      const ropVerification = this.ropVerificationDao.create({
        id: generateSnowflakeId(),
        ...createDto,
        rop_verification_id: ropVerificationId,
        reg_expiry: createDto.reg_expiry
          ? new Date(createDto.reg_expiry)
          : undefined,
        // Manually entered ROP details are treated as Fetched unless stated otherwise.
        fetch_status: fetchStatus,
        // Proof of when this record was actually validated (manual entry —
        // no raw API payload exists for this path, only the timestamp).
        fetched_at:
          fetchStatus === RopVerificationStatus.VALIDATED
            ? new Date()
            : undefined,
        created_by: getCreatedById(actor),
      });

      const plateNumber = anprCapture.plate_number ?? null;
      const afterState = snapshotRopVerification(ropVerification, plateNumber);
      applyRopVerificationAuditContext(
        ropVerification.id,
        EMPTY_ROP_VERIFICATION_AUDIT,
        afterState,
      );
      let saved: RopVerification;
      try {
        saved = await this.ropVerificationDao.save(ropVerification);
      } finally {
        clearRopVerificationAuditContext();
      }
      // Fetched → validate the linked capture + queue the appointment.
      await this.syncCaptureFromRop(saved);
      this.logger.log(
        `ROP verification created with ID: ${saved.id}`,
        RopVerificationService.context,
      );
      return saved;
    } catch (error) {
      if (
        error instanceof ResourceNotFoundException ||
        error instanceof DuplicateResourceException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to create ROP verification: ${(error as Error).message}`,
        (error as Error).stack,
        RopVerificationService.context,
      );
      throw new DatabaseException(
        'Failed to create ROP verification. Please try again.',
      );
    }
  }

  async findAll(
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<RopVerification>> {
    this.logger.log(
      `Fetching ROP verifications — page: ${query.page}, limit: ${query.limit}`,
      RopVerificationService.context,
    );
    try {
      return await this.ropVerificationDao.findPaginated(query);
    } catch (error) {
      this.logger.error(
        `Failed to fetch ROP verifications: ${(error as Error).message}`,
        (error as Error).stack,
        RopVerificationService.context,
      );
      throw new DatabaseException(
        'Failed to fetch ROP verifications. Please try again.',
      );
    }
  }

  async findOne(id: string): Promise<RopVerification> {
    this.logger.log(
      `Fetching ROP verification ID: ${id}`,
      RopVerificationService.context,
    );
    try {
      const ropVerification = await this.ropVerificationDao.findActiveById(id);
      if (!ropVerification) {
        throw new ResourceNotFoundException('RopVerification', id);
      }
      return ropVerification;
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to fetch ROP verification: ${(error as Error).message}`,
        (error as Error).stack,
        RopVerificationService.context,
      );
      throw new DatabaseException(
        'Failed to fetch ROP verification. Please try again.',
      );
    }
  }

  async update(
    id: string,
    updateDto: UpdateRopVerificationDto,
  ): Promise<RopVerification> {
    this.logger.log(
      `Updating ROP verification ID: ${id}`,
      RopVerificationService.context,
    );
    try {
      const ropVerification = await this.findOne(id);
      const plateNumber = await this.resolvePlateNumber(
        ropVerification.anpr_capture_id,
      );
      const beforeState = snapshotRopVerification(ropVerification, plateNumber);
      const becomingValidated =
        updateDto.fetch_status === RopVerificationStatus.VALIDATED &&
        ropVerification.fetch_status !== RopVerificationStatus.VALIDATED;
      const merged = this.ropVerificationDao.merge(ropVerification, {
        ...updateDto,
        ...(updateDto.reg_expiry
          ? { reg_expiry: new Date(updateDto.reg_expiry) }
          : {}),
        // Stamp the moment this record was (re)validated, same as create().
        ...(becomingValidated && !ropVerification.fetched_at
          ? { fetched_at: new Date() }
          : {}),
      });
      const afterState = snapshotRopVerification(merged, plateNumber);
      applyRopVerificationAuditContext(merged.id, beforeState, afterState);
      let saved: RopVerification;
      try {
        saved = await this.ropVerificationDao.save(merged);
      } finally {
        clearRopVerificationAuditContext();
      }
      // Fetched → validate the linked capture + queue the appointment.
      await this.syncCaptureFromRop(saved);
      this.logger.log(
        `ROP verification updated with ID: ${saved.id}`,
        RopVerificationService.context,
      );
      return saved;
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to update ROP verification: ${(error as Error).message}`,
        (error as Error).stack,
        RopVerificationService.context,
      );
      throw new DatabaseException(
        'Failed to update ROP verification. Please try again.',
      );
    }
  }

  async remove(id: string): Promise<void> {
    this.logger.log(
      `Deleting ROP verification ID: ${id}`,
      RopVerificationService.context,
    );
    try {
      const ropVerification = await this.findOne(id);
      const plateNumber = await this.resolvePlateNumber(
        ropVerification.anpr_capture_id,
      );
      const beforeState = snapshotRopVerification(ropVerification, plateNumber);
      const merged = this.ropVerificationDao.merge(ropVerification, {
        is_deleted: true,
      });
      const afterState = snapshotRopVerification(merged, plateNumber);
      applyRopVerificationAuditContext(merged.id, beforeState, afterState);
      try {
        await this.ropVerificationDao.save(merged);
      } finally {
        clearRopVerificationAuditContext();
      }
      this.logger.log(
        `ROP verification soft-deleted ID: ${id}`,
        RopVerificationService.context,
      );
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to delete ROP verification: ${(error as Error).message}`,
        (error as Error).stack,
        RopVerificationService.context,
      );
      throw new DatabaseException(
        'Failed to delete ROP verification. Please try again.',
      );
    }
  }
}
