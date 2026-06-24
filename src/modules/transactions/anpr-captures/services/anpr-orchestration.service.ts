import { Injectable } from '@nestjs/common';
import { AppLogger } from '../../../../common/logger/app.logger';
import { generateSnowflakeId } from '../../../../common/shared/snowflakeIdGeneration';

import { VehicleDao } from '../../../database/dao/vehicle.dao';
import { VehicleRecordDao } from '../../../database/dao/vehicle-record.dao';
import { CustomerDao } from '../../../database/dao/customer.dao';
import { AppointmentDao } from '../../../database/dao/appointment.dao';
import { JobDao } from '../../../database/dao/job.dao';
import { RopVerificationDao } from '../../../database/dao/rop-verification.dao';
import { RopApiClientService } from '../../../integrations/rop/rop-api-client.service';

import { AnprCapture } from '../../../database/entity/anpr-capture.entity';
import { VehicleRecord } from '../../../database/entity/vehicle-record.entity';

@Injectable()
export class AnprOrchestrationService {
  private static readonly context = 'AnprOrchestrationService';

  constructor(
    private readonly logger: AppLogger,
    private readonly vehicleDao: VehicleDao,
    private readonly vehicleRecordDao: VehicleRecordDao,
    private readonly customerDao: CustomerDao,
    private readonly appointmentDao: AppointmentDao,
    private readonly jobDao: JobDao,
    private readonly ropVerificationDao: RopVerificationDao,
    private readonly ropApiClient: RopApiClientService,
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
    let vehicleRecord: VehicleRecord | undefined;
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
      vehicleRecord = record;
    } catch (err) {
      this.logger.warn(
        `[Orchestration] VehicleRecord upsert failed for ${plate}: ${(err as Error).message}`,
        AnprOrchestrationService.context,
      );
    }

    // ─── Step 3: ROP API fetch + save rop_verification ───────────────────
    let ownerName: string | undefined;
    let ownerPhone: string | undefined;
    let chassisNo: string | undefined;
    try {
      const ropResult = await this.ropApiClient.fetchByPlate(plate);
      const nextRopId = await this.ropVerificationDao.getNextRopVerificationId();
      const ropVerification = this.ropVerificationDao.create({
        id: generateSnowflakeId(),
        rop_verification_id: nextRopId,
        anpr_capture_id: anprCapture.id,
        owner_name: ropResult.owner_name,
        vehicle_make: ropResult.vehicle_make,
        vehicle_model: ropResult.vehicle_model,
        reg_no: ropResult.reg_no,
        chassis_no: ropResult.chassis_no,
        insurance: ropResult.insurance,
        reg_expiry: ropResult.reg_expiry,
        fetch_status: 'Fetched',
        created_by: 'anpr-system',
      });
      await this.ropVerificationDao.save(ropVerification);
      ownerName = ropResult.owner_name;
      ownerPhone = ropResult.owner_phone;
      chassisNo = ropResult.chassis_no;
      this.logger.log(
        `[Orchestration] ROP verification saved for capture: ${anprCapture.id}`,
        AnprOrchestrationService.context,
      );
    } catch (err) {
      this.logger.warn(
        `[Orchestration] ROP fetch/save failed for ${plate}: ${(err as Error).message}`,
        AnprOrchestrationService.context,
      );
    }

    // ─── Step 4: Customer upsert ──────────────────────────────────────────
    let customerId: string | undefined;
    try {
      const phoneLookup = ownerPhone ?? `ANPR-${plate.slice(0, 26)}`;
      let customer = await this.customerDao.findActiveByPhone(phoneLookup);
      if (!customer) {
        const nextId = await this.customerDao.getNextCustomerId();
        customer = this.customerDao.create({
          id: generateSnowflakeId(),
          customer_id: nextId,
          name: ownerName ?? plate,
          phone: phoneLookup,
          owner_name: ownerName,
          chassis_no: chassisNo,
          primary_vehicle_record_id: vehicleRecord?.id ?? null,
          created_by: 'anpr-system',
        });
        customer = await this.customerDao.save(customer);
        this.logger.log(
          `[Orchestration] Customer created: ${customer.id}`,
          AnprOrchestrationService.context,
        );
      }
      customerId = customer.id;
    } catch (err) {
      this.logger.warn(
        `[Orchestration] Customer upsert failed for ${plate}: ${(err as Error).message}`,
        AnprOrchestrationService.context,
      );
    }

    if (!vehicleRecord || !customerId) {
      this.logger.warn(
        `[Orchestration] Skipping appointment/job creation — missing vehicleRecord or customer for plate: ${plate}`,
        AnprOrchestrationService.context,
      );
      return;
    }

    // ─── Step 5: Appointment + Job creation in parallel ──────────────────
    const [appointmentResult, jobResult] = await Promise.allSettled([
      this.createQueuedAppointment(anprCapture.id, customerId, vehicleRecord.id),
      this.createQueuedJob(anprCapture.id, customerId, vehicleRecord.id),
    ]);

    if (appointmentResult.status === 'rejected') {
      this.logger.warn(
        `[Orchestration] Appointment creation failed: ${(appointmentResult.reason as Error).message}`,
        AnprOrchestrationService.context,
      );
    }
    if (jobResult.status === 'rejected') {
      this.logger.warn(
        `[Orchestration] Job creation failed: ${(jobResult.reason as Error).message}`,
        AnprOrchestrationService.context,
      );
    }
  }

  private async createQueuedAppointment(
    anprCaptureId: string,
    customerId: string,
    vehicleRecordId: string,
  ): Promise<void> {
    const nextId = await this.appointmentDao.getNextAppointmentId();
    const appointment = this.appointmentDao.create({
      id: generateSnowflakeId(),
      appointment_id: nextId,
      anpr_capture_id: anprCaptureId,
      customer_id: customerId,
      vehicle_record_id: vehicleRecordId,
      status: 'Queued',
      appointment_at: new Date(),
      created_by: 'anpr-system',
    });
    await this.appointmentDao.save(appointment);
    this.logger.log(
      `[Orchestration] Appointment queued: ${appointment.id}`,
      AnprOrchestrationService.context,
    );
  }

  private async createQueuedJob(
    anprCaptureId: string,
    customerId: string,
    vehicleRecordId: string,
  ): Promise<void> {
    const nextId = await this.jobDao.getNextJobId();
    const job = this.jobDao.create({
      id: generateSnowflakeId(),
      job_id: nextId,
      source: 'ANPR',
      status: 'Queued',
      customer_id: customerId,
      vehicle_record_id: vehicleRecordId,
      anpr_capture_id: anprCaptureId,
      created_by: 'anpr-system',
    });
    await this.jobDao.save(job);
    this.logger.log(
      `[Orchestration] Job queued: ${job.id}`,
      AnprOrchestrationService.context,
    );
  }
}
