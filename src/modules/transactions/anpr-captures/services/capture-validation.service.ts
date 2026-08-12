import { Injectable } from '@nestjs/common';

import { AppLogger } from '../../../../common/logger/app.logger';
import { generateSnowflakeId } from '../../../../common/shared/snowflakeIdGeneration';
import { generateIdNumber } from '../../../../common/shared/id-number.util';
import { AnprCaptureStatus } from 'src/common/enums/camera.enums';
import { AppointmentStatus, BookingType } from 'src/common/enums/common.enums';
import { JobService } from '../../../jobs/services/job.service';

import { LineDao } from '../../../database/dao/line.dao';
import { CentreDao } from '../../../database/dao/centre.dao';
import { VehicleDao } from '../../../database/dao/vehicle.dao';
import { ChargeDao } from '../../../database/dao/charge.dao';
import { CustomerDao } from '../../../database/dao/customer.dao';
import { AppointmentDao } from '../../../database/dao/appointment.dao';
import { AnprCaptureDao } from '../../../database/dao/anpr-capture.dao';
import { VehicleRecordDao } from '../../../database/dao/vehicle-record.dao';
import { AppointmentApiClientService } from '../../../../common/integrations/appointments/appointment-api-client.service';

import { AnprCapture } from '../../../database/entity/anpr-capture.entity';
import { VehicleRecord } from '../../../database/entity/vehicle-record.entity';
import { RopVerification } from '../../../database/entity/rop-verification.entity';
import { patchAuditContext } from '../../../../common/audit/audit-context';

/**
 * Shared validation pipeline for ANPR captures. Centralizes the "capture is
 * validated → vehicle record is enriched → appointment is queued" logic so it
 * can be triggered from three places without circular DI:
 *   • operator validation of a capture (AnprCaptureService.validate)
 *   • automatic ROP fetch success (AnprOrchestrationService)
 *   • manual ROP entry saved as Fetched (RopVerificationService)
 */
@Injectable()
export class CaptureValidationService {
  private static readonly context = 'CaptureValidationService';

  constructor(
    private readonly logger: AppLogger,
    private readonly lineDao: LineDao,
    private readonly vehicleDao: VehicleDao,
    private readonly chargeDao: ChargeDao,
    private readonly customerDao: CustomerDao,
    private readonly appointmentDao: AppointmentDao,
    private readonly anprCaptureDao: AnprCaptureDao,
    private readonly vehicleRecordDao: VehicleRecordDao,
    private readonly centreDao: CentreDao,
    private readonly appointmentApi: AppointmentApiClientService,
    private readonly jobService: JobService,
  ) {}

  /**
   * ROP verification became "Fetched" for this capture: enrich the vehicle
   * record with the combined ANPR + ROP details, flip the capture to Validated,
   * stamp the current-ROP pointer, and queue the appointment.
   */
  async applyRopFetched(
    capture: AnprCapture,
    rop: RopVerification,
    createdBy: string,
  ): Promise<void> {
    await this.ensureQueuedAppointment(capture, createdBy, rop);
    patchAuditContext({ suppressAnprCaptureAudit: true });
    try {
      await this.anprCaptureDao.update(capture.id, {
        status: AnprCaptureStatus.VALIDATED,
        rop_verification_id: rop.id,
      });
    } finally {
      patchAuditContext({ suppressAnprCaptureAudit: false });
    }
    this.logger.log(
      `Capture ${capture.id} validated from ROP ${rop.id}`,
      CaptureValidationService.context,
    );

    // ROP is the gate: only now, with the vehicle present AND verified, is an
    // online booking eligible to become a job automatically.
    await this.autoConvertPaidOnlineBooking(capture, createdBy);
  }

  /**
   * Converts a paid online booking into a job once the vehicle has arrived and
   * ROP has verified it.
   *
   * Payment removes the blocker, arrival provides the trigger: the booking is
   * paid days in advance, but a job means a car is here now, so creating one at
   * ingest time would produce jobs for vehicles that may never turn up — and
   * the ROP same-day submission rule would already have expired them.
   *
   * Never throws. A conversion that cannot proceed leaves the appointment
   * Queued for an operator to convert by hand; failing here would undo a
   * capture validation that is otherwise correct.
   */
  private async autoConvertPaidOnlineBooking(
    capture: AnprCapture,
    createdBy: string,
  ): Promise<void> {
    try {
      const appointment = await this.appointmentDao.findByAnprCaptureId(
        capture.id,
      );
      if (!appointment) return;

      // Walk-ins are converted by an operator — there is no upstream payment
      // to trust, so nothing to auto-approve against.
      if (!appointment.provider_booking_id) return;
      if (appointment.status !== AppointmentStatus.QUEUED) return;

      // FREE is a free re-inspection — equally "paid for" as far as the gate
      // on job creation is concerned.
      const paid =
        appointment.provider_payment_status === 'PAID' ||
        appointment.provider_payment_status === 'FREE';
      if (!paid) {
        this.logger.log(
          `Appointment ${appointment.id} not auto-converted: provider payment status is ${appointment.provider_payment_status ?? 'unknown'}`,
          CaptureValidationService.context,
        );
        return;
      }

      // Job creation requires a customer; the booking usually supplies one, but
      // not when the provider sent no phone number.
      if (!appointment.customer_id) {
        this.logger.log(
          `Appointment ${appointment.id} not auto-converted: no customer on the booking`,
          CaptureValidationService.context,
        );
        return;
      }

      const job = await this.jobService.createFromAppointment(appointment.id, {
        user: { id: createdBy, center_id: appointment.centre_id ?? undefined },
      } as never);

      this.logger.log(
        `Auto-converted paid booking ${appointment.provider_booking_id} → job ${job?.id ?? '(created)'}`,
        CaptureValidationService.context,
      );
    } catch (err) {
      this.logger.warn(
        `Auto-convert skipped for capture ${capture.id}: ${(err as Error).message}`,
        CaptureValidationService.context,
      );
    }
  }

  /**
   * Upsert the vehicle record for the capture's plate and queue a thin
   * appointment (customer entered later). Idempotent — skips if an appointment
   * already exists for the capture. When a ROP verification is supplied, its
   * owner/vehicle details enrich the vehicle record too.
   */
  async ensureQueuedAppointment(
    capture: AnprCapture,
    createdBy: string,
    rop?: RopVerification | null,
  ): Promise<void> {
    const vehicleRecord = await this.upsertVehicleRecord(
      capture,
      rop,
      createdBy,
    );
    // Pre-fill the customer from the ROP owner details when available; the
    // operator completes the remaining required fields (phone, driver, mulkiya).
    const customerId = await this.ensureCustomerFromRop(
      rop,
      vehicleRecord,
      createdBy,
    );

    // LOCAL FIRST. Two kinds of Queued appointment can already exist for this
    // plate with no capture attached:
    //   • an online booking ingested from the provider before the car arrived
    //   • a walk-in an operator pre-created at the counter
    // Either way, attach this capture to it rather than creating a duplicate —
    // that is what makes "Convert to Job" appear on the existing row.
    const captureLine = capture.line_id
      ? await this.lineDao.findActiveById(capture.line_id)
      : null;

    const onlineMatch = await this.appointmentDao.findQueuedOnlineByPlate(
      capture.plate_number,
      captureLine?.centre_id ?? null,
    );
    const walkInMatch =
      onlineMatch ??
      (await this.appointmentDao.findLatestQueuedByPlate(capture.plate_number));
    if (walkInMatch) {
      const patch: {
        anpr_capture_id: string;
        vehicle_record_id?: string;
        customer_id?: string;
        line_id?: string;
        centre_id?: string;
      } = { anpr_capture_id: capture.id };
      // An ingested booking knows its centre but not which lane the car would
      // use — that is only known now, on arrival.
      if (capture.line_id && !walkInMatch.line_id) {
        patch.line_id = capture.line_id;
      }
      if (captureLine?.centre_id && !walkInMatch.centre_id) {
        patch.centre_id = captureLine.centre_id;
      }
      if (vehicleRecord && walkInMatch.vehicle_record_id !== vehicleRecord.id) {
        patch.vehicle_record_id = vehicleRecord.id;
      }
      // Only fill customer if the walk-in doesn't already have one — never
      // overwrite operator-entered data.
      if (customerId && !walkInMatch.customer_id) {
        patch.customer_id = customerId;
      }
      await this.appointmentDao.update(walkInMatch.id, patch);
      this.logger.log(
        `Matched walk-in appointment ${walkInMatch.id} to arriving capture ${capture.id}`,
        CaptureValidationService.context,
      );
      return;
    }

    const existing = await this.appointmentDao.findByAnprCaptureId(capture.id);
    if (existing) {
      // Keep the appointment pointed at the (possibly newly created) record /
      // pre-filled ROP customer.
      const patch: { vehicle_record_id?: string; customer_id?: string } = {};
      if (vehicleRecord && existing.vehicle_record_id !== vehicleRecord.id) {
        patch.vehicle_record_id = vehicleRecord.id;
      }
      if (customerId && !existing.customer_id) {
        patch.customer_id = customerId;
      }
      if (Object.keys(patch).length > 0) {
        await this.appointmentDao.update(existing.id, patch);
      }
      this.logger.log(
        `Appointment already exists for capture ${capture.id} — skipping create`,
        CaptureValidationService.context,
      );
      return;
    }

    // Carry the capture's line (and its centre) onto the appointment so the
    // queue shows Centre / Line.
    const line = captureLine;

    // If the plate is a pre-booked online appointment, mark it Online;
    // otherwise Walk-in. The lookup is per branch, so resolve the capture's
    // centre first — an unlinked centre yields null, i.e. Walk-in.
    // ANPR rarely reads plate type, hence the PRIVATE default, which covers
    // the overwhelming majority of inspections.
    const centre = line?.centre_id
      ? await this.centreDao.findActiveById(line.centre_id)
      : null;
    const online = centre?.provider_branch_code
      ? await this.appointmentApi.findByPlate(
          centre.provider_branch_code,
          capture.plate_type?.trim() || 'PRIVATE',
          capture.plate_number,
        )
      : null;

    const appointment = this.appointmentDao.create({
      id: generateSnowflakeId(),
      appointment_id: await this.appointmentDao.getNextAppointmentId(),
      anpr_capture_id: capture.id,
      customer_id: customerId ?? null,
      vehicle_record_id: vehicleRecord?.id ?? null,
      centre_id: line?.centre_id ?? null,
      line_id: capture.line_id ?? null,
      booking_type: online ? BookingType.ONLINE : BookingType.WALK_IN,
      status: AppointmentStatus.QUEUED,
      appointment_at: online?.appointment_at
        ? new Date(online.appointment_at)
        : new Date(),
      created_by: createdBy,
    });
    await this.appointmentDao.save(appointment);
    this.logger.log(
      `Appointment queued for capture ${capture.id}: ${appointment.id}`,
      CaptureValidationService.context,
    );
  }

  /**
   * Pre-fill / link a customer from the ROP owner details when the ROP row
   * carries an owner name. ROP has no phone, so owner_phone_number is left
   * blank for the operator to complete (surfaced by the required-field checks).
   * Returns the customer id, or null when there's nothing to pre-fill.
   */
  private async ensureCustomerFromRop(
    rop: RopVerification | null | undefined,
    vehicleRecord: VehicleRecord,
    createdBy: string,
  ): Promise<string | null> {
    const ownerName = rop?.owner_name?.trim();
    if (!ownerName) {
      return null;
    }

    const existing = await this.customerDao.findByVehicleRecordId(
      vehicleRecord.id,
    );
    if (existing) {
      const merged = this.customerDao.merge(existing, {
        owner_name: existing.owner_name || ownerName,
        chassis_no: existing.chassis_no ?? rop?.chassis_no,
        plate_number: existing.plate_number ?? vehicleRecord.plate_number,
        id_number: existing.id_number ?? generateIdNumber(),
      });
      return (await this.customerDao.save(merged)).id;
    }

    const created = this.customerDao.create({
      id: generateSnowflakeId(),
      customer_id: await this.customerDao.getNextCustomerId(),
      id_number: generateIdNumber(),
      owner_name: ownerName,
      owner_phone_number: '', // ROP provides no phone — operator completes it
      chassis_no: rop?.chassis_no,
      plate_number: vehicleRecord.plate_number,
      vehicle_record_id: vehicleRecord.id,
      created_by: createdBy,
    });
    return (await this.customerDao.save(created)).id;
  }

  /**
   * Create or enrich the vehicle record for the capture's plate from the
   * combined ANPR (type / colours) + ROP (make / model / chassis) details, and
   * link it to the (also enriched) vehicle master.
   */
  private async upsertVehicleRecord(
    capture: AnprCapture,
    rop: RopVerification | null | undefined,
    createdBy: string,
  ): Promise<VehicleRecord> {
    const plate = capture.plate_number;
    const masterId = await this.upsertVehicleMaster(capture, rop, createdBy);
    const existing = await this.vehicleRecordDao.findByPlateNumber(plate);

    const enrich = {
      vehicle_type: capture.vehicle_type ?? existing?.vehicle_type,
      plate_color: capture.plate_color ?? existing?.plate_color,
      vehicle_color: capture.vehicle_color ?? existing?.vehicle_color,
      vehicle_make: rop?.vehicle_make ?? existing?.vehicle_make,
      vehicle_model: rop?.vehicle_model ?? existing?.vehicle_model,
      chassis_no: rop?.chassis_no ?? existing?.chassis_no,
      vehicle_master_id: masterId ?? existing?.vehicle_master_id ?? null,
    };

    if (!existing) {
      const created = this.vehicleRecordDao.create({
        id: generateSnowflakeId(),
        vehicle_record_id: await this.vehicleRecordDao.getNextVehicleRecordId(),
        plate_number: plate,
        ...enrich,
        created_by: createdBy,
      });
      return this.vehicleRecordDao.save(created);
    }

    return this.vehicleRecordDao.save(
      this.vehicleRecordDao.merge(existing, enrich),
    );
  }

  /**
   * Create or enrich the vehicle master (master.vehicles) for the capture's
   * plate. Fills the vehicle type (ANPR) and VIN / chassis (ROP) that were empty
   * when the master was first created from the raw plate. Returns the master id.
   */
  private async upsertVehicleMaster(
    capture: AnprCapture,
    rop: RopVerification | null | undefined,
    createdBy: string,
  ): Promise<string> {
    const code = capture.plate_number;
    const existing = await this.vehicleDao.findByCode(code);
    const vehicleType = capture.vehicle_type ?? existing?.vehicle_type;

    // Map the vehicle category from the configured charges by matching the
    // vehicle type (centre-specific charge preferred, then global).
    const chargeCategoryId =
      (await this.resolveChargeCategory(capture, vehicleType)) ??
      existing?.charge_category_id ??
      null;

    const enrich = {
      vehicle_type: vehicleType,
      vin_no: rop?.chassis_no ?? existing?.vin_no,
      charge_category_id: chargeCategoryId,
    };

    if (!existing) {
      const created = this.vehicleDao.create({
        id: generateSnowflakeId(),
        vehicle_id: await this.vehicleDao.getNextVehicleId(),
        name: code,
        code,
        status: 'Active',
        ...enrich,
        created_by: createdBy,
      });
      return (await this.vehicleDao.save(created)).id;
    }

    return (await this.vehicleDao.save(this.vehicleDao.merge(existing, enrich)))
      .id;
  }

  /**
   * Resolve the charge category (vehicle category) for a vehicle type by
   * matching the configured charges — centre-specific first, then global.
   * Returns null when the type has no configured charge.
   */
  private async resolveChargeCategory(
    capture: AnprCapture,
    vehicleType: string | null | undefined,
  ): Promise<string | null> {
    if (!vehicleType) {
      return null;
    }
    const line = capture.line_id
      ? await this.lineDao.findActiveById(capture.line_id)
      : null;
    const charge = await this.chargeDao.findByVehicleType(
      line?.centre_id ?? undefined,
      vehicleType,
    );
    return charge?.charge_category_id ?? null;
  }
}
