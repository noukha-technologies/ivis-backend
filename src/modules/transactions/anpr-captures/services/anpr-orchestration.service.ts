import { Injectable } from '@nestjs/common';
import { AppLogger } from '../../../../common/logger/app.logger';
import { generateSnowflakeId } from '../../../../common/shared/snowflakeIdGeneration';

import { RopVerificationStatus } from 'src/common/enums/common.enums';

import { VehicleDao } from '../../../database/dao/vehicle.dao';
import { VehicleRecordDao } from '../../../database/dao/vehicle-record.dao';
import { RopVerificationDao } from '../../../database/dao/rop-verification.dao';
import { AnprCaptureDao } from '../../../database/dao/anpr-capture.dao';
import { RopApiClientService } from '../../../integrations/rop/rop-api-client.service';

import { AnprCapture } from '../../../database/entity/anpr-capture.entity';
import { CaptureValidationService } from './capture-validation.service';

const SYSTEM_ACTOR = 'anpr-system';
const normalizePlate = (v: string | null | undefined): string =>
  (v ?? '').replace(/\s+/g, '').toUpperCase();

@Injectable()
export class AnprOrchestrationService {
  private static readonly context = 'AnprOrchestrationService';

  constructor(
    private readonly logger: AppLogger,
    private readonly vehicleDao: VehicleDao,
    private readonly vehicleRecordDao: VehicleRecordDao,
    private readonly ropVerificationDao: RopVerificationDao,
    private readonly anprCaptureDao: AnprCaptureDao,
    private readonly ropApiClient: RopApiClientService,
    private readonly captureValidation: CaptureValidationService,
  ) {}

  runPostCapture(anprCapture: AnprCapture): void {
    this.executePostCapture(anprCapture).catch((err: Error) => {
      this.logger.error(
        `[Orchestration] Unhandled failure for plate ${anprCapture.plate_number}: ${err.message}`,
        err.stack,
        AnprOrchestrationService.context,
      );
    });
  }

  private async executePostCapture(anprCapture: AnprCapture): Promise<void> {
    const plate = anprCapture.plate_number;
    this.logger.log(
      `[Orchestration] Starting post-capture pipeline for plate: ${plate}`,
      AnprOrchestrationService.context,
    );

    // ─── Step 1: Vehicle master (master.vehicles) upsert by plate code ───
    let vehicleMasterId: string | undefined;
    try {
      let vehicle = await this.vehicleDao.findByCode(plate);
      if (!vehicle) {
        const nextId = await this.vehicleDao.getNextVehicleId();
        vehicle = this.vehicleDao.create({
          id: generateSnowflakeId(),
          vehicle_id: nextId,
          name: plate,
          code: plate,
          status: 'Active',
          created_by: 'anpr-system',
        });
        vehicle = await this.vehicleDao.save(vehicle);
        this.logger.log(
          `[Orchestration] Vehicle master created: ${vehicle.id}`,
          AnprOrchestrationService.context,
        );
      }
      vehicleMasterId = vehicle.id;
    } catch (err) {
      this.logger.warn(
        `[Orchestration] Vehicle master upsert failed for ${plate}: ${(err as Error).message}`,
        AnprOrchestrationService.context,
      );
    }

    // ─── Step 2: VehicleRecord (transaction.vehicle_records) upsert by plate ───
    try {
      let record = await this.vehicleRecordDao.findByPlateNumber(plate);
      if (!record) {
        const nextId = await this.vehicleRecordDao.getNextVehicleRecordId();
        record = this.vehicleRecordDao.create({
          id: generateSnowflakeId(),
          vehicle_record_id: nextId,
          plate_number: plate,
          vehicle_master_id: vehicleMasterId ?? null,
          created_by: 'anpr-system',
        });
        record = await this.vehicleRecordDao.save(record);
        this.logger.log(
          `[Orchestration] VehicleRecord created: ${record.id}`,
          AnprOrchestrationService.context,
        );
      } else if (vehicleMasterId && !record.vehicle_master_id) {
        record.vehicle_master_id = vehicleMasterId;
        record = await this.vehicleRecordDao.save(record);
      }
    } catch (err) {
      this.logger.warn(
        `[Orchestration] VehicleRecord upsert failed for ${plate}: ${(err as Error).message}`,
        AnprOrchestrationService.context,
      );
    }

    // ─── Step 3: ROP API fetch + save rop_verification ───────────────────
    // Status rules:
    //   • API data + plate matches capture → Fetched → auto-validate the capture
    //     (enrich vehicle record, flip capture to Validated, queue appointment).
    //   • API data but plate mismatch      → Failed (does not correspond).
    //   • API not configured (no data)     → Pending (no real API yet).
    //   • API throws                       → Failed.
    try {
      const ropResult = await this.ropApiClient.fetchByPlate(plate);
      const plateMatches =
        ropResult != null &&
        normalizePlate(ropResult.reg_no) === normalizePlate(plate);

      let status: RopVerificationStatus;
      if (ropResult == null) {
        status = RopVerificationStatus.PENDING;
      } else if (plateMatches) {
        status = RopVerificationStatus.VALIDATED; // 'Fetched'
      } else {
        this.logger.warn(
          `[Orchestration] ROP plate mismatch for capture ${anprCapture.id}: capture=${plate} rop=${ropResult.reg_no}`,
          AnprOrchestrationService.context,
        );
        status = RopVerificationStatus.FAILED;
      }

      const savedRop = await this.ropVerificationDao.save(
        this.ropVerificationDao.create({
          id: generateSnowflakeId(),
          rop_verification_id:
            await this.ropVerificationDao.getNextRopVerificationId(),
          anpr_capture_id: anprCapture.id,
          owner_name: ropResult?.owner_name,
          vehicle_make: ropResult?.vehicle_make,
          vehicle_model: ropResult?.vehicle_model,
          reg_no: ropResult?.reg_no ?? plate,
          chassis_no: ropResult?.chassis_no,
          insurance: ropResult?.insurance,
          reg_expiry: ropResult?.reg_expiry,
          fetch_status: status,
          raw_response: ropResult?.raw_response ?? null,
          fetched_at: ropResult != null ? new Date() : null,
          created_by: SYSTEM_ACTOR,
        }),
      );

      // Fetched → validate the capture + queue the appointment (combined data).
      if (status === RopVerificationStatus.VALIDATED) {
        await this.captureValidation.applyRopFetched(
          anprCapture,
          savedRop,
          SYSTEM_ACTOR,
        );
      }
      this.logger.log(
        `[Orchestration] ROP verification saved (${status}) for capture: ${anprCapture.id}`,
        AnprOrchestrationService.context,
      );
    } catch (err) {
      this.logger.warn(
        `[Orchestration] ROP fetch/save failed for ${plate}: ${(err as Error).message}`,
        AnprOrchestrationService.context,
      );
      // Record the failed attempt so the ROP verification tab reflects it; the
      // capture itself stays 'Pending' (not validated).
      try {
        const nextRopId =
          await this.ropVerificationDao.getNextRopVerificationId();
        const failedVerification = this.ropVerificationDao.create({
          id: generateSnowflakeId(),
          rop_verification_id: nextRopId,
          anpr_capture_id: anprCapture.id,
          reg_no: plate,
          fetch_status: RopVerificationStatus.FAILED,
          created_by: SYSTEM_ACTOR,
        });
        await this.ropVerificationDao.save(failedVerification);
        // Capture is NOT stamped on failure — only a successful fetch updates it.
      } catch (saveErr) {
        this.logger.warn(
          `[Orchestration] Failed to persist Failed ROP verification for ${plate}: ${(saveErr as Error).message}`,
          AnprOrchestrationService.context,
        );
      }
    }

    // NOTE: No customer is created here. A customer is created only when the
    // appointment is processed with real customer details on the Appointments
    // page (see AppointmentService.syncCustomerFromAppointment). ANPR only
    // resolves the vehicle / vehicle-record and ROP verification.

    this.logger.log(
      `[Orchestration] Post-capture pipeline complete for plate: ${plate} (awaiting validation)`,
      AnprOrchestrationService.context,
    );
  }
}
