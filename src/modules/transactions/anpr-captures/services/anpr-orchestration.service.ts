import { Injectable } from '@nestjs/common';
import { AppLogger } from '../../../../common/logger/app.logger';
import { generateSnowflakeId } from '../../../../common/shared/snowflakeIdGeneration';

import { RopVerificationStatus } from 'src/common/enums/common.enums';

import { VehicleDao } from '../../../database/dao/vehicle.dao';
import { VehicleRecordDao } from '../../../database/dao/vehicle-record.dao';
import { RopVerificationDao } from '../../../database/dao/rop-verification.dao';
import { RopApiClientService } from '../../../integrations/rop/rop-api-client.service';

import { AnprCapture } from '../../../database/entity/anpr-capture.entity';

@Injectable()
export class AnprOrchestrationService {
  private static readonly context = 'AnprOrchestrationService';

  constructor(
    private readonly logger: AppLogger,
    private readonly vehicleDao: VehicleDao,
    private readonly vehicleRecordDao: VehicleRecordDao,
    private readonly ropVerificationDao: RopVerificationDao,
    private readonly ropApiClient: RopApiClientService,
  ) { }

  runPostCapture(anprCapture: AnprCapture): void {
    this.executePostCapture(anprCapture).catch((err: Error) => {
      this.logger.error(`[Orchestration] Unhandled failure for plate ${anprCapture.plate_number}: ${err.message}`, err.stack, AnprOrchestrationService.context);
    });
  }

  private async executePostCapture(anprCapture: AnprCapture): Promise<void> {
    const plate = anprCapture.plate_number;
    this.logger.log(`[Orchestration] Starting post-capture pipeline for plate: ${plate}`, AnprOrchestrationService.context);

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
    try {
      const fetchRopFromApiResponse = await this.ropApiClient.fetchByPlate(plate);
      const createRopVerificationPayload = this.ropVerificationDao.create({
        id: generateSnowflakeId(),
        rop_verification_id: await this.ropVerificationDao.getNextRopVerificationId(),
        anpr_capture_id: anprCapture.id,
        owner_name: fetchRopFromApiResponse.owner_name,
        vehicle_make: fetchRopFromApiResponse.vehicle_make,
        vehicle_model: fetchRopFromApiResponse.vehicle_model,
        reg_no: fetchRopFromApiResponse.reg_no,
        chassis_no: fetchRopFromApiResponse.chassis_no,
        insurance: fetchRopFromApiResponse.insurance,
        reg_expiry: fetchRopFromApiResponse.reg_expiry,
        fetch_status: RopVerificationStatus.VALIDATED,
        created_by: 'anpr-system',
      });
      await this.ropVerificationDao.save(createRopVerificationPayload);
      this.logger.log(
        `[Orchestration] ROP verification saved for capture: ${anprCapture.id}`,
        AnprOrchestrationService.context,
      );
    } catch (err) {
      this.logger.warn(`[Orchestration] ROP fetch/save failed for ${plate}: ${(err as Error).message}`, AnprOrchestrationService.context);
      // Record the failed attempt so the ROP verification tab reflects it; the
      // capture itself stays 'Pending' (not validated).
      try {
        const nextRopId = await this.ropVerificationDao.getNextRopVerificationId();
        const failedVerification = this.ropVerificationDao.create({
          id: generateSnowflakeId(),
          rop_verification_id: nextRopId,
          anpr_capture_id: anprCapture.id,
          reg_no: plate,
          fetch_status: RopVerificationStatus.FAILED,
          created_by: 'anpr-system',
        });
        await this.ropVerificationDao.save(failedVerification);
      } catch (saveErr) {
        this.logger.warn(`[Orchestration] Failed to persist Failed ROP verification for ${plate}: ${(saveErr as Error).message}`, AnprOrchestrationService.context);
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
