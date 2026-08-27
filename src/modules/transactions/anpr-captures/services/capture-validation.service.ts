import { Injectable } from '@nestjs/common';

import { AppLogger } from '../../../../common/logger/app.logger';
import { generateSnowflakeId } from '../../../../common/shared/snowflakeIdGeneration';
import { generateIdNumber } from '../../../../common/shared/id-number.util';
import { AnprCaptureStatus } from 'src/common/enums/camera.enums';
import { AppointmentStatus } from 'src/common/enums/common.enums';
import { JobService } from '../../../jobs/services/job.service';

import { LineDao } from '../../../database/dao/line.dao';
import { VehicleDao } from '../../../database/dao/vehicle.dao';
import { ChargeDao } from '../../../database/dao/charge.dao';
import { CustomerDao } from '../../../database/dao/customer.dao';
import { AppointmentDao } from '../../../database/dao/appointment.dao';
import { JobDao } from '../../../database/dao/job.dao';
import { UsersDao } from '../../../database/dao/users.dao';
import { Appointment } from '../../../database/entity/appointment.entity';
import { AnprCaptureDao } from '../../../database/dao/anpr-capture.dao';
import { VehicleRecordDao } from '../../../database/dao/vehicle-record.dao';

import { AnprCapture } from '../../../database/entity/anpr-capture.entity';
import { VehicleRecord } from '../../../database/entity/vehicle-record.entity';
import { RopVerification } from '../../../database/entity/rop-verification.entity';
import { patchAuditContext } from '../../../../common/audit/audit-context';
import { omanDayRange } from '../../../../common/utils/util';
import { vehicleTypesAgree } from '../../../../common/utils/normalize-vehicle-type.util';

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
    private readonly jobService: JobService,
    private readonly jobDao: JobDao,
    private readonly usersDao: UsersDao,
  ) {}

  /**
   * Picks the line and the responsible user for a conversion nobody is
   * watching.
   *
   * The lane the camera read wins outright: the IN file is written to that
   * lane's Admin PC folder and the OUT file comes back against it, so a car
   * sitting on lane 2 cannot be given a job on lane 1 however free lane 1 is.
   * Only when the arrival carries no lane at all does it fall back to the
   * first free lane in the centre — free meaning no job on it is still
   * Pending or In Progress, the same definition the lane-status heartbeat
   * uses.
   *
   * Returns null when no line has anyone mapped to it: a job must belong to
   * someone, and inventing an owner is worse than leaving the booking for an
   * operator to convert by hand.
   */
  private async resolveAutoAssignment(
    appointment: Appointment,
    capture: AnprCapture,
  ): Promise<{ line_id: string; assigned_user_id: string } | null> {
    const preferred = appointment.line_id ?? capture.line_id ?? null;
    const candidates: string[] = [];

    if (preferred) {
      candidates.push(preferred);
    } else {
      const centreId =
        appointment.centre_id ??
        (capture.line_id
          ? ((await this.lineDao.findActiveById(capture.line_id))?.centre_id ??
            null)
          : null);
      if (!centreId) return null;

      const lines = await this.lineDao.findActiveByCentreId(centreId);
      for (const line of lines) {
        const occupying = await this.jobDao.findActiveByLineId(line.id);
        if (occupying.length === 0) candidates.push(line.id);
      }
    }

    for (const lineId of candidates) {
      const users = await this.usersDao.findActiveByLineId(lineId);
      if (users.length > 0) {
        return { line_id: lineId, assigned_user_id: users[0].id };
      }
    }

    return null;
  }

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
    // The camera classifies the vehicle it saw; ROP states what is registered.
    // They should describe the same thing. A disagreement means one of them is
    // wrong about the car on the lane — which changes what it is priced as and
    // what is filed back to ROP — so it is recorded now, while both values are
    // in hand. Deliberately not a block: overlay OCR is lossy enough that
    // refusing the vehicle would strand real cars on a bad frame.
    if (!vehicleTypesAgree(capture.vehicle_type, rop.vehicle_type)) {
      this.logger.warn(
        `Vehicle type disagreement for capture ${capture.id} (${capture.plate_number}): camera read "${capture.vehicle_type}", ROP holds "${rop.vehicle_type}"`,
        CaptureValidationService.context,
      );
    }

    await this.attachCaptureToAppointment(capture, createdBy, rop);
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
  /**
   * Records why this booking was not converted, so the queue row can say so.
   * Never throws: failing to write an explanation must not also lose the
   * capture validation that produced it.
   */
  private async noteBlocked(
    appointment: Appointment,
    reason: string | null,
  ): Promise<void> {
    if ((appointment.auto_convert_blocked_reason ?? null) === reason) return;
    try {
      await this.appointmentDao.update(appointment.id, {
        auto_convert_blocked_reason: reason,
      });
    } catch (err) {
      this.logger.warn(
        `Could not record block reason for appointment ${appointment.id}: ${(err as Error).message}`,
        CaptureValidationService.context,
      );
    }
  }

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
        const reason = `Payment not settled with the provider (${appointment.provider_payment_status ?? 'unknown'})`;
        this.logger.log(
          `Appointment ${appointment.id} not auto-converted: ${reason}`,
          CaptureValidationService.context,
        );
        await this.noteBlocked(appointment, reason);
        return;
      }

      // Job creation requires a customer; the booking usually supplies one, but
      // not when the provider sent no phone number.
      if (!appointment.customer_id) {
        const reason = 'No customer on the booking — enter customer details';
        this.logger.log(
          `Appointment ${appointment.id} not auto-converted: ${reason}`,
          CaptureValidationService.context,
        );
        await this.noteBlocked(appointment, reason);
        return;
      }

      // Driver details are required on a job and the provider does not send
      // them, so they are filled in by hand on the convert screen. Converting
      // unattended would bury a blank the operator never gets asked for —
      // leave it queued and let them complete it, which is the same rule the
      // list applies when it withholds "Ready to Convert".
      const customer = await this.customerDao.findActiveById(
        appointment.customer_id,
      );
      const driverIncomplete =
        !customer?.driver_name?.trim() ||
        !customer?.driver_phone_number?.trim();
      if (driverIncomplete) {
        const reason =
          'Driver name and phone are missing — enter them to convert';
        this.logger.log(
          `Appointment ${appointment.id} not auto-converted: ${reason}`,
          CaptureValidationService.context,
        );
        await this.noteBlocked(appointment, reason);
        return;
      }

      // A job runs on a line and belongs to someone. An operator picks both on
      // the convert screen; an unattended conversion has to resolve them
      // itself, and without them createFromAppointment refuses — which is
      // exactly what used to happen here, silently, on every arrival.
      const assignment = await this.resolveAutoAssignment(appointment, capture);
      if (!assignment) {
        const reason =
          'No free line with an assigned user — convert manually and pick one';
        this.logger.warn(
          `Appointment ${appointment.id} not auto-converted: ${reason}`,
          CaptureValidationService.context,
        );
        await this.noteBlocked(appointment, reason);
        return;
      }

      const job = await this.jobService.createFromAppointment(
        appointment.id,
        {
          user: {
            id: createdBy,
            center_id: appointment.centre_id ?? undefined,
          },
        } as never,
        assignment,
      );

      // Converted: nothing is blocking it any more.
      await this.noteBlocked(appointment, null);

      this.logger.log(
        `Auto-converted paid booking ${appointment.provider_booking_id} → job ${job?.id ?? '(created)'}`,
        CaptureValidationService.context,
      );
    } catch (err) {
      // The gates inside createFromAppointment throw with operator-facing
      // messages — surface whichever one refused rather than only logging it.
      const message = (err as Error).message;
      this.logger.warn(
        `Auto-convert skipped for capture ${capture.id}: ${message}`,
        CaptureValidationService.context,
      );
      try {
        const appointment = await this.appointmentDao.findByAnprCaptureId(
          capture.id,
        );
        if (appointment)
          await this.noteBlocked(appointment, message.slice(0, 255));
      } catch {
        // Already in the failure path — nothing further to do.
      }
    }
  }

  /**
   * Upsert the vehicle record for the capture's plate, then attach the capture
   * to today's appointment for it — never to a new one.
   *
   * The appointment always exists first: an online booking arrives through the
   * ingest service before the car does, and a walk-in is raised at reception
   * with payment taken. The camera's job is to say which of them just drove in,
   * not to invent a third. A plate with neither leaves with its capture
   * recorded and nothing queued, and pairs up when reception raises the
   * walk-in.
   *
   * Idempotent. When a ROP verification is supplied, its owner/vehicle details
   * enrich the vehicle record too.
   */
  async attachCaptureToAppointment(
    capture: AnprCapture,
    createdBy: string,
    rop?: RopVerification | null,
  ): Promise<void> {
    const vehicleRecord = await this.upsertVehicleRecord(
      capture,
      rop,
      createdBy,
    );
    // Pre-fill the customer from the ROP owner details when available (name,
    // chassis and Mulkiya ID); the operator completes what ROP cannot give -
    // phone and driver details.
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

    // A capture may only touch today's records.
    //
    // Everything downstream of this is same-day work: the ROP submission must
    // happen on the day the visit was initiated, so an appointment from any
    // other day belongs to a visit that is already over. A capture replayed
    // from a backlog after downtime is a car that left hours ago, and pairing
    // it with a live booking would put the wrong arrival against it.
    const today = omanDayRange();
    const captureTime = capture.capture_time ?? new Date();
    if (captureTime < today.start || captureTime >= today.end) {
      this.logger.warn(
        `Capture ${capture.id} (${capture.plate_number}) is not from today — leaving appointments untouched`,
        CaptureValidationService.context,
      );
      return;
    }
    const onlineMatch = await this.appointmentDao.findQueuedOnlineByPlate(
      capture.plate_number,
      captureLine?.centre_id ?? null,
      today,
    );
    // The walk-in reception raised for this car, if the online lookup found
    // nothing. Same window as above — see findLatestQueuedByPlate.
    const walkInMatch =
      onlineMatch ??
      (await this.appointmentDao.findLatestQueuedByPlate(
        capture.plate_number,
        today,
      ));
    if (walkInMatch) {
      const patch: {
        anpr_capture_id: string;
        rop_verification_id?: string;
        vehicle_record_id?: string;
        customer_id?: string;
        line_id?: string;
        centre_id?: string;
      } = { anpr_capture_id: capture.id };
      // Job creation gates on the appointment's own ROP link, so without this
      // the verification exists and reads Fetched while the appointment still
      // looks unverified — the row says "Ready to Convert" and the convert
      // step then refuses it. Guarded because this method is also called
      // without a ROP row, where there is nothing to link yet.
      if (rop) {
        patch.rop_verification_id = rop.id;
      }
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
      const patch: {
        vehicle_record_id?: string;
        customer_id?: string;
        rop_verification_id?: string;
      } = {};
      if (vehicleRecord && existing.vehicle_record_id !== vehicleRecord.id) {
        patch.vehicle_record_id = vehicleRecord.id;
      }
      if (customerId && !existing.customer_id) {
        patch.customer_id = customerId;
      }
      if (rop && existing.rop_verification_id !== rop.id) {
        patch.rop_verification_id = rop.id;
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

    // NOT creating one is the point.
    //
    // An arrival is not a booking. A vehicle reaches the lane either against
    // an online booking or against a walk-in reception raised and took payment
    // for — both of which already exist by the time the camera sees the car,
    // and both of which are matched above. Inventing a third kind of
    // appointment here put vehicles in the queue that nobody had booked and
    // nobody had paid for, and job creation would refuse them anyway.
    //
    // The capture is still recorded. It simply waits for reception to raise
    // the walk-in, at which point the plate matches and this runs again.
    this.logger.log(
      `No appointment today for capture ${capture.id} (${capture.plate_number}) — capture recorded, nothing queued`,
      CaptureValidationService.context,
    );
  }

  /**
   * ROP's Mulkiya ID in the shape the rest of the app stores it. Mirrors the
   * @Transform on mulkiya_id in appointment.dto.ts so a value arriving through
   * ROP and one typed by an operator are stored identically. Returns undefined
   * for anything that would not satisfy isValidMulkiyaId (10 digits + 1
   * letter), leaving the field blank for the operator rather than seeding the
   * form with a value the save would reject.
   */
  private static normalizeMulkiyaId(value?: string | null): string | undefined {
    const cleaned = value?.replace(/\s+/g, '').toUpperCase();
    if (!cleaned) return undefined;
    return /^\d{10}[A-Z]$/.test(cleaned) ? cleaned : undefined;
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
        owner_phone_number:
          existing.owner_phone_number || (rop?.owner_phone ?? ''),
        chassis_no: existing.chassis_no ?? rop?.chassis_no,
        mulkiya_id:
          existing.mulkiya_id ??
          CaptureValidationService.normalizeMulkiyaId(rop?.mulkiya_id),
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
      // ROP does carry the owner's phone, already normalised to the bare
      // 8-digit local form by the API client. It used to be hardcoded blank
      // here, so every ANPR-created appointment showed the phone as missing
      // and withheld "Ready to Convert" over a value we already held.
      owner_phone_number: rop?.owner_phone ?? '',
      chassis_no: rop?.chassis_no,
      mulkiya_id: CaptureValidationService.normalizeMulkiyaId(rop?.mulkiya_id),
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

    // An operator's explicit choice wins over anything derived here. A walk-in
    // registered at reception already carries the category the operator picked,
    // and deriving one from the vehicle type on arrival would silently replace
    // a real decision with a guess — then re-price the job against it. Only a
    // vehicle nobody has categorised yet gets the lookup.
    const chargeCategoryId =
      existing?.charge_category_id ??
      (await this.resolveChargeCategory(capture, vehicleType)) ??
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
