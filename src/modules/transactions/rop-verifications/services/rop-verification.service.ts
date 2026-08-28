import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
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
import { RopApiClientService } from '../../../../common/integrations/rop/rop-api-client.service';
import {
  applyRopVerificationAuditContext,
  clearRopVerificationAuditContext,
  EMPTY_ROP_VERIFICATION_AUDIT,
  snapshotRopVerification,
} from '../../../../common/audit/rop-verification-audit';

/** `fetch_status` is a string column, so the enum member is compared as one. */
const isFetched = (status: string | null | undefined): boolean =>
  status === (RopVerificationStatus.VALIDATED as string);

@Injectable()
export class RopVerificationService {
  private static readonly context = 'RopVerificationService';

  constructor(
    private readonly ropVerificationDao: RopVerificationDao,
    private readonly anprCaptureDao: AnprCaptureDao,
    private readonly captureValidation: CaptureValidationService,
    private readonly ropApiClient: RopApiClientService,
    private readonly logger: AppLogger,
  ) {}

  /**
   * Re-runs the ROP lookup for a verification that ended Failed.
   *
   * A Failed row used to be terminal: nothing retried it, so the vehicle was
   * stuck behind the ROP gate for good. This is the single recovery path —
   * the operator's button and the background sweep both come through here, so
   * they cannot drift apart.
   *
   * fetchByPlate already retries transient failures three times internally, so
   * this is one more genuine attempt rather than a loop around a loop. On
   * success the capture is re-validated, which resumes the normal pipeline
   * (vehicle record enriched, appointment matched or queued, auto-convert
   * attempted) exactly as if ROP had answered first time.
   */
  async refetch(id: string): Promise<RopVerification> {
    const verification = await this.findOne(id);
    const plate = verification.reg_no?.trim();
    if (!plate) {
      throw new BadRequestException(
        'This verification has no plate number to look up.',
      );
    }

    // An answer already on file is not re-requested. ROP does not change
    // intraday, so a second call would spend a request to overwrite a record
    // with itself — and on a bad day, to overwrite a good record with a worse
    // one. The row action is hidden for these, so this catches a direct call.
    if (isFetched(verification.fetch_status)) {
      throw new ConflictException(
        `ROP details for ${plate} have already been fetched — there is nothing left to request.`,
      );
    }

    const result = await this.ropApiClient.fetchByPlate(plate);
    const matches =
      result != null &&
      (result.reg_no ?? plate).replace(/[^A-Za-z0-9]/g, '').toUpperCase() ===
        plate.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

    if (!result || !matches) {
      this.logger.warn(
        `ROP re-fetch for ${plate} did not succeed (${result ? 'plate mismatch' : 'no data'}) — still Failed`,
        RopVerificationService.context,
      );
      return verification;
    }

    const merged = this.ropVerificationDao.merge(verification, {
      owner_name: result.owner_name ?? verification.owner_name,
      owner_phone: result.owner_phone ?? verification.owner_phone,
      driver_name: result.driver_name ?? verification.driver_name,
      driver_phone: result.driver_phone ?? verification.driver_phone,
      mulkiya_id: result.mulkiya_id ?? verification.mulkiya_id,
      vehicle_make: result.vehicle_make ?? verification.vehicle_make,
      vehicle_model: result.vehicle_model ?? verification.vehicle_model,
      plate_color: result.plate_color ?? verification.plate_color,
      vehicle_color: result.vehicle_color ?? verification.vehicle_color,
      vehicle_type: result.vehicle_type ?? verification.vehicle_type,
      chassis_no: result.chassis_no ?? verification.chassis_no,
      insurance: result.insurance ?? verification.insurance,
      reg_expiry: result.reg_expiry ?? verification.reg_expiry,
      raw_response: result.raw_response ?? verification.raw_response,
      fetch_status: RopVerificationStatus.VALIDATED,
      fetched_at: new Date(),
    });
    const saved = await this.ropVerificationDao.save(merged);

    this.logger.log(
      `ROP re-fetch succeeded for ${plate} — verification ${saved.id} is now Fetched`,
      RopVerificationService.context,
    );

    // Resume the pipeline the original failure interrupted.
    if (saved.anpr_capture_id) {
      const capture = await this.anprCaptureDao.findActiveById(
        saved.anpr_capture_id,
      );
      if (capture) {
        await this.captureValidation.applyRopFetched(
          capture,
          saved,
          'rop-refetch',
        );
      }
    }

    return saved;
  }

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
