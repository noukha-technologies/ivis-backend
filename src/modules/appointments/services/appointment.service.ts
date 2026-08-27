import { BadRequestException, Injectable } from '@nestjs/common';

import type { UserContext } from '../../../common/dto/auth.dto';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { RopVerificationStatus } from '../../../common/enums/common.enums';
import { PaymentStatusEnum } from '../../../common/enums/payment.enums';
import {
  AppointmentAuditDetails,
  AppointmentAuditEntity,
  PlateEligibility,
  PlateLookupResult,
} from 'src/common/interfaces/common.interfaces';
import { AppointmentStatus, BookingType } from 'src/common/enums/common.enums';
import { PaginatedResult } from '../../../common/interfaces/pagination.interface';
import {
  appointmentExpiry,
  isSameOmanDay,
  omanDayRange,
} from '../../../common/utils/util';
import { vehicleTypesAgree } from '../../../common/utils/normalize-vehicle-type.util';
import {
  CreateAppointmentDto,
  UpdateAppointmentDto,
} from '../../../common/dto/appointment.dto';

import { AppLogger } from '../../../common/logger/app.logger';
import { getCreatedById } from '../../../common/utils/created-by.util';
import { patchAuditContext } from '../../../common/audit/audit-context';
import { generateIdNumber } from '../../../common/shared/id-number.util';
import { generateSnowflakeId } from '../../../common/shared/snowflakeIdGeneration';
import {
  DatabaseException,
  DuplicateResourceException,
  ResourceNotFoundException,
} from '../../../common/exceptions/custom.exception';

import { LineDao } from '../../database/dao/line.dao';
import { CentreDao } from '../../database/dao/centre.dao';
import { CustomerDao } from '../../database/dao/customer.dao';
import { AuditLogDao } from '../../database/dao/audit-log.dao';
import { AppointmentDao } from '../../database/dao/appointment.dao';
import { AnprCaptureDao } from '../../database/dao/anpr-capture.dao';
import { PaymentTypeDao } from '../../database/dao/payment-type.dao';
import { Appointment } from '../../database/entity/appointment.entity';
import { VehicleRecordDao } from '../../database/dao/vehicle-record.dao';
import { RopVerificationDao } from '../../database/dao/rop-verification.dao';
import { PaymentsDao } from '../../database/dao/payments.dao';
import { VehicleDao } from '../../database/dao/vehicle.dao';
import { RopApiClientService } from '../../../common/integrations/rop/rop-api-client.service';

@Injectable()
export class AppointmentService {
  private static readonly context = 'AppointmentService';

  constructor(
    private readonly lineDao: LineDao,
    private readonly logger: AppLogger,
    private readonly centreDao: CentreDao,
    private readonly auditLogDao: AuditLogDao,
    private readonly customerDao: CustomerDao,
    private readonly appointmentDao: AppointmentDao,
    private readonly anprCaptureDao: AnprCaptureDao,
    private readonly paymentTypeDao: PaymentTypeDao,
    private readonly ropApiClient: RopApiClientService,
    private readonly vehicleRecordDao: VehicleRecordDao,
    private readonly ropVerificationDao: RopVerificationDao,
    private readonly paymentsDao: PaymentsDao,
    private readonly vehicleDao: VehicleDao,
  ) {}

  /**
   * Whether this plate is ready to become a job, and what is still missing.
   *
   * Reception can register a vehicle at any point — this does not gate that.
   * It reports what the queue row will show: `eligible` true means the capture
   * and the ROP verification are both present, so Convert to Job is available;
   * false means the appointment is created and waiting, and `reason` says what
   * for.
   *
   *   1. ANPR must hold a capture for the plate. Captured today is the normal
   *      case — the car is at the centre now. An older capture for the same
   *      vehicle counts too, so a returning vehicle whose camera reading has
   *      not landed yet still reads as known.
   *   2. ROP must have been fetched for it (`Fetched`).
   *
   * Read-only, and it never calls the ROP API — both answers come from what
   * the capture pipeline has already recorded locally.
   */
  async checkPlateEligibility(plate: string): Promise<PlateEligibility> {
    const p = plate?.trim() ?? '';
    const base: PlateEligibility = {
      plate: p,
      anpr_found: false,
      anpr_today: false,
      anpr_capture_id: null,
      anpr_capture_time: null,
      rop_found: false,
      rop_status: null,
      rop_verified: false,
      eligible: false,
      reason: null,
    };

    if (!p) {
      return { ...base, reason: 'Enter a plate number.' };
    }

    const capture = await this.anprCaptureDao.findLatestByPlate(p);
    if (!capture) {
      return {
        ...base,
        reason: `Not captured by ANPR yet. Convert to Job unlocks once the vehicle is read at a lane.`,
      };
    }

    const captureTime = capture.capture_time ?? null;
    const withAnpr: PlateEligibility = {
      ...base,
      anpr_found: true,
      anpr_today: captureTime ? isSameOmanDay(captureTime, new Date()) : false,
      anpr_capture_id: capture.id,
      anpr_capture_time: captureTime,
    };

    const rop = await this.ropVerificationDao.findLatestByRegNo(p);
    if (!rop) {
      return {
        ...withAnpr,
        reason: `Waiting on ROP for ${p}. The lookup runs automatically once the vehicle is captured.`,
      };
    }

    // fetch_status is a plain varchar on the entity; narrow once here so the
    // rest reads as the enum it actually holds.
    const ropStatus = rop.fetch_status as RopVerificationStatus | undefined;
    const verified = ropStatus === RopVerificationStatus.VALIDATED;
    return {
      ...withAnpr,
      rop_found: true,
      rop_status: rop.fetch_status ?? null,
      rop_verified: verified,
      eligible: verified,
      reason: verified
        ? null
        : ropStatus === RopVerificationStatus.FAILED
          ? `ROP verification failed for ${p}. It is retried automatically — resolve it before converting.`
          : `ROP verification for ${p} is still pending.`,
    };
  }

  async resolveByPlate(plate: string): Promise<PlateLookupResult | null> {
    const p = plate?.trim();
    if (!p) return null;

    let rop = await this.ropVerificationDao.findLatestByRegNo(p);

    if (!rop) {
      const ropResult = await this.ropApiClient.fetchByPlate(p);
      if (ropResult) {
        rop = await this.ropVerificationDao.save(
          this.ropVerificationDao.create({
            id: generateSnowflakeId(),
            rop_verification_id:
              await this.ropVerificationDao.getNextRopVerificationId(),
            anpr_capture_id: null,
            owner_name: ropResult.owner_name,
            owner_phone: ropResult.owner_phone,
            driver_name: ropResult.driver_name,
            driver_phone: ropResult.driver_phone,
            mulkiya_id: ropResult.mulkiya_id,
            vehicle_make: ropResult.vehicle_make,
            vehicle_model: ropResult.vehicle_model,
            reg_no: ropResult.reg_no ?? p,
            chassis_no: ropResult.chassis_no,
            plate_color: ropResult.plate_color,
            vehicle_color: ropResult.vehicle_color,
            vehicle_type: ropResult.vehicle_type,
            insurance: ropResult.insurance,
            reg_expiry: ropResult.reg_expiry,
            fetch_status: RopVerificationStatus.VALIDATED,
            raw_response: ropResult.raw_response ?? null,
            fetched_at: new Date(),
            created_by: 'walk-in-plate-lookup',
          }),
        );
        this.logger.log(
          `ROP plate lookup saved for walk-in — plate: ${p}`,
          AppointmentService.context,
        );
      }
    }

    const record = await this.vehicleRecordDao.findByPlateNumber(p);
    const customer = record
      ? await this.customerDao.findByVehicleRecordId(record.id)
      : null;
    const latestCapture = await this.anprCaptureDao.findLatestByPlate(p);

    if (!rop && !record) return null;

    return {
      plate_number: rop?.reg_no ?? record?.plate_number ?? p,
      owner_name: rop?.owner_name ?? customer?.owner_name ?? null,
      owner_phone: customer?.owner_phone_number ?? rop?.owner_phone ?? null,
      customer_name: rop?.owner_name ?? customer?.owner_name ?? null,
      customer_phone: customer?.owner_phone_number ?? rop?.owner_phone ?? null,
      driver_name: customer?.driver_name ?? rop?.driver_name ?? null,
      driver_phone: customer?.driver_phone_number ?? rop?.driver_phone ?? null,
      mulkiya_id: customer?.mulkiya_id ?? rop?.mulkiya_id ?? null,
      id_number: customer?.id_number ?? customer?.mulkiya_id ?? null,
      plate_color:
        latestCapture?.plate_color ??
        record?.plate_color ??
        rop?.plate_color ??
        null,
      vehicle_color: record?.vehicle_color ?? rop?.vehicle_color ?? null,
      vehicle_type:
        record?.vehicle_type ??
        record?.vehicleMaster?.vehicle_type ??
        rop?.vehicle_type ??
        null,
      chassis_no: rop?.chassis_no ?? record?.chassis_no ?? null,
      // ROP first: it is the government record, and the only place make/model
      // originate. The vehicle record is a local mirror that may predate the
      // ROP fetch.
      vehicle_make: rop?.vehicle_make ?? record?.vehicle_make ?? null,
      vehicle_model: rop?.vehicle_model ?? record?.vehicle_model ?? null,
      charge_category_id: record?.vehicleMaster?.charge_category_id ?? null,
    };
  }

  async create(
    createDto: CreateAppointmentDto,
    actor: UserContext,
  ): Promise<Appointment> {
    this.logger.log('Creating appointment', AppointmentService.context);

    try {
      await this.validateReferences(createDto);

      let appointmentId = createDto.appointment_id;
      if (!appointmentId) {
        appointmentId = await this.appointmentDao.getNextAppointmentId();
      } else {
        const existing =
          await this.appointmentDao.findByAppointmentId(appointmentId);
        if (existing) {
          throw new DuplicateResourceException(
            'Appointment',
            'appointment_id',
            appointmentId,
          );
        }
      }

      // Resolve the plate (from the DTO or the linked ANPR capture).
      let plateNumber = createDto.plate_number;
      let capture = null;
      if (createDto.anpr_capture_id) {
        capture = await this.anprCaptureDao.findActiveById(
          createDto.anpr_capture_id,
        );
        if (!capture) {
          throw new ResourceNotFoundException(
            'AnprCapture',
            createDto.anpr_capture_id,
          );
        }
        plateNumber = plateNumber || capture.plate_number;
      }

      // Payment is mandatory for every job, and reception is where a walk-in
      // pays. Unlike ANPR and ROP — which the customer cannot influence and
      // which the appointment can simply wait for — the money is settled at the
      // counter or not at all, so this one is asked while they are standing
      // there. FOC is 0, which is a value; only a missing amount is refused.
      if (createDto.amount === undefined || createDto.amount === null) {
        throw new BadRequestException(
          'Record the payment (or mark it FOC) before creating the appointment.',
        );
      }

      // ANPR and ROP are NOT required to register. A customer can reach
      // reception before the camera has read the plate — or before ROP has
      // answered — and turning them away at the counter for that helps nobody.
      // The appointment is created and waits: the arriving capture is matched
      // onto it by applyRopFetched, and only then does Convert to Job become
      // available. The verification is enforced there, where it decides whether
      // an inspection may start, rather than here, where it would only decide
      // whether a customer may queue.

      // One open appointment per plate. A vehicle already queued or scheduled
      // must finish that visit — be CONVERTED into a job, or CANCELLED —
      // before it can be booked in again; otherwise the same car occupies two
      // queue slots. Checked here because the plate is fully resolved by this
      // point and nothing has been written yet.
      if (plateNumber) {
        const open = await this.appointmentDao.findOpenByPlate(
          plateNumber,
          omanDayRange().start,
        );
        if (open) {
          throw new DuplicateResourceException(
            'Appointment',
            'plate_number',
            `${plateNumber} (appointment #${open.appointment_id} is still ${open.status})`,
          );
        }
      }

      // Resolved BEFORE the vehicle record, not after, because ROP is the
      // fallback source of make/model — the ANPR capture carries neither, and
      // the walk-in form only supplies them when the operator types them in.
      // Looking it up afterwards (as this used to) meant the vehicle record was
      // written without them and stayed empty for the vehicle's whole life.
      const rop = plateNumber
        ? await this.ropVerificationDao.findLatestByRegNo(plateNumber)
        : null;

      // Ensure a vehicle record exists for the plate and carries the ANPR/DTO
      // vehicle type + chassis (#6 — ANPR vehicle type flows into the record),
      // plus make/model off the ROP record.
      const vehicleRecordId = await this.ensureVehicleRecord(
        createDto.vehicle_record_id,
        plateNumber,
        createDto.vehicle_type ?? capture?.vehicle_type ?? undefined,
        createDto.chassis_no,
        actor,
        createDto.plate_color,
        createDto.vehicle_color,
        createDto.vehicle_make ?? rop?.vehicle_make ?? undefined,
        createDto.vehicle_model ?? rop?.vehicle_model ?? undefined,
        createDto.charge_category_id,
      );

      // Create / link the customer with all entered details (#4) and link it to
      // the vehicle record. The appointment then only stores the customer id.
      // Walk-ins may be created without customer details — those are filled later
      // via the customer popup (PATCH), so only link a customer when we have one.
      const hasCustomer = !!(
        createDto.customer_id ||
        (createDto.customer_name && createDto.customer_phone)
      );
      const customerId = hasCustomer
        ? await this.ensureCustomer(createDto, vehicleRecordId, actor)
        : undefined;

      const resolvedCentreId =
        createDto.centre_id ?? actor.user.center_id ?? undefined;

      // `rop` is resolved above, before the vehicle record — linking it here
      // means a later real ANPR arrival for the same plate can be matched back
      // to this appointment.
      const appointment = this.appointmentDao.create({
        id: generateSnowflakeId(),
        appointment_id: appointmentId,
        anpr_capture_id: createDto.anpr_capture_id,
        rop_verification_id: rop?.id ?? null,
        customer_id: customerId,
        vehicle_record_id: vehicleRecordId,
        centre_id: resolvedCentreId,
        line_id: createDto.line_id,
        appointment_at: new Date(createDto.appointment_at),
        status: AppointmentStatus.QUEUED,
        notes: createDto.notes,
        booking_type: createDto.booking_type ?? BookingType.WALK_IN,
        created_by: getCreatedById(actor),
      });

      const auditDetails: AppointmentAuditDetails = {
        customer_name: createDto.customer_name ?? null,
        customer_phone: createDto.customer_phone ?? null,
        owner_name: createDto.owner_name ?? createDto.customer_name ?? null,
        driver_phone_number: createDto.driver_phone ?? null,
        mulkiya_id: createDto.mulkiya_id ?? null,
        plate_number: plateNumber ?? null,
        plate_color: createDto.plate_color ?? capture?.plate_color ?? null,
        vehicle_type: createDto.vehicle_type ?? capture?.vehicle_type ?? null,
        charge_category_id: createDto.charge_category_id ?? null,
        chassis_no: createDto.chassis_no ?? null,
      };

      this.attachAuditDetails(appointment, auditDetails);
      patchAuditContext({ appointmentAuditDetails: { ...auditDetails } });

      try {
        const saved = await this.appointmentDao.save(appointment);
        this.logger.log(
          `Appointment created ID: ${saved.id}`,
          AppointmentService.context,
        );

        await this.recordWalkInPayment(saved, createDto);

        return (await this.appointmentDao.findActiveById(saved.id)) ?? saved;
      } finally {
        patchAuditContext({
          appointmentAuditDetails: null,
          appointmentAuditDetailsBefore: null,
        });
      }
    } catch (error) {
      // A deliberate refusal carries a message written for the operator — the
      // ANPR/ROP gate, the payment gate, the one-open-appointment-per-plate
      // rule. Swallowing it into a DatabaseException turns a 400 that says
      // what to fix into a 500 that says "try again", and the operator retries
      // the same thing forever.
      if (
        error instanceof BadRequestException ||
        error instanceof DuplicateResourceException ||
        error instanceof ResourceNotFoundException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to create appointment: ${(error as Error).message}`,
        (error as Error).stack,
        AppointmentService.context,
      );
      throw new DatabaseException(
        'Failed to create appointment. Please try again.',
      );
    }
  }

  /**
   * Stamps the derived expiry fields onto a row. Applied on every read path so
   * a caller can never see an appointment without knowing whether it is dead.
   */
  private withExpiry(appointment: Appointment): Appointment {
    const { is_expired, expired_since } = appointmentExpiry(
      appointment.status,
      appointment.appointment_at,
    );
    appointment.is_expired = is_expired;
    appointment.expired_since = expired_since;

    // Camera vs ROP on what kind of vehicle this is. Derived rather than
    // stored: both sides are already on the row's relations, and a value that
    // is only ever a function of them has nothing to gain from a column that
    // could fall out of step with either.
    const camera = appointment.anprCapture?.vehicle_type;
    const rop = appointment.ropVerification?.vehicle_type;
    appointment.vehicle_type_mismatch = vehicleTypesAgree(camera, rop)
      ? null
      : { camera: camera as string, rop: rop as string };

    return appointment;
  }

  async findAll(
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<Appointment>> {
    try {
      const result = await this.appointmentDao.findPaginated(query);
      return { ...result, data: result.data.map((a) => this.withExpiry(a)) };
    } catch (error) {
      this.logger.error(
        `Failed to fetch appointments: ${(error as Error).message}`,
        (error as Error).stack,
        AppointmentService.context,
      );
      throw new DatabaseException(
        'Failed to fetch appointments. Please try again.',
      );
    }
  }

  async findOne(id: string): Promise<Appointment> {
    const appointment = await this.appointmentDao.findActiveById(id);
    if (!appointment) {
      throw new ResourceNotFoundException('Appointment', id);
    }
    return this.withExpiry(appointment);
  }

  /**
   * Writes the payment taken at reception as a real Payments row.
   *
   * The wizard used to send `amount` and nothing kept it: the appointment has
   * no such column, so the money collected at the counter was recorded
   * nowhere. Job creation then had no payment to find.
   *
   * Written through the DAO rather than PaymentsService.create for the same
   * reason the provider ingest does: that path auto-creates a job when paid,
   * and no job exists yet — the vehicle still has to be converted, with its own
   * line and assignee. `job_id` is filled in later by linkExistingPaymentToJob,
   * so the same row follows the appointment into its job instead of a second
   * one being raised.
   *
   * FOC is `grand_total` 0 with status PAID, exactly as the provider ingest
   * records a FREE re-inspection — a free inspection is settled, not unpaid.
   */
  private async recordWalkInPayment(
    appointment: Appointment,
    createDto: CreateAppointmentDto,
  ): Promise<void> {
    const amount = Number(createDto.amount ?? 0);

    // Money has to belong to someone and to a vehicle — both are non-nullable
    // on Payments. The wizard always supplies them, so this is a guard against
    // a caller that does not rather than an expected path.
    if (!appointment.customer_id || !appointment.vehicle_record_id) {
      this.logger.warn(
        `Appointment ${appointment.id} has no customer or vehicle record — payment of ${amount.toFixed(3)} OMR not recorded`,
        AppointmentService.context,
      );
      return;
    }

    const existing = await this.paymentsDao.findSettledByAppointmentId(
      appointment.id,
    );
    if (existing) return;

    await this.paymentsDao.save(
      this.paymentsDao.create({
        id: generateSnowflakeId(),
        payment_id: await this.paymentsDao.getNextPaymentsId(),
        appointment_id: appointment.id,
        customer_id: appointment.customer_id,
        vehicle_record_id: appointment.vehicle_record_id,
        centre_id: appointment.centre_id ?? null,
        line_id: appointment.line_id ?? null,
        // Filled when the vehicle is converted — see linkExistingPaymentToJob.
        job_id: null,
        payment_type_id: createDto.payment_type_id ?? null,
        status: PaymentStatusEnum.PAID,
        grand_total: amount,
        pay_date: new Date(),
        created_by: 'walk-in-appointment',
      }),
    );

    this.logger.log(
      `Recorded walk-in payment of ${amount.toFixed(3)} OMR for appointment ${appointment.id}`,
      AppointmentService.context,
    );
  }

  /**
   * Cancels an appointment an operator no longer expects to happen — the
   * customer left, or never turned up.
   *
   * Refused once CONVERTED: a job exists, and whether to abandon inspection
   * work is a decision on the job, not on the booking that produced it. Any
   * settled payment is Cancelled, not refunded, exactly as an upstream
   * withdrawal is treated — we know the visit stopped, not that money moved.
   */
  async cancel(id: string, reason?: string): Promise<Appointment> {
    const appointment = await this.findOne(id);

    if (appointment.status === AppointmentStatus.CONVERTED) {
      throw new BadRequestException(
        'This appointment has already been converted to a job. Cancel or redo the job instead.',
      );
    }
    if (appointment.status === AppointmentStatus.CANCELLED) {
      return appointment;
    }

    const payment = await this.paymentsDao.findSettledByAppointmentId(id);
    if (payment) {
      await this.paymentsDao.update(payment.id, {
        status: PaymentStatusEnum.CANCELLED,
      });
    }

    await this.appointmentDao.update(id, {
      status: AppointmentStatus.CANCELLED,
      auto_convert_blocked_reason: reason?.trim() || null,
    });

    this.logger.log(
      `Appointment ${id} cancelled${reason ? `: ${reason}` : ''}`,
      AppointmentService.context,
    );

    return this.findOne(id);
  }

  async update(
    id: string,
    updateDto: UpdateAppointmentDto,
    actor: UserContext,
  ): Promise<Appointment> {
    const appointment = await this.findOne(id);
    await this.validateReferences(updateDto);

    // Refresh the vehicle record (vehicle type / chassis) when those change (#6).
    const vehicleRecordId = await this.ensureVehicleRecord(
      updateDto.vehicle_record_id ?? appointment.vehicle_record_id ?? undefined,
      updateDto.plate_number ?? appointment.vehicleRecord?.plate_number,
      updateDto.vehicle_type,
      updateDto.chassis_no,
      actor,
      updateDto.plate_color,
      updateDto.vehicle_color,
      updateDto.vehicle_make,
      updateDto.vehicle_model,
    );

    // Update the linked customer's details (#4). Reuse the existing customer id.
    const customerId =
      updateDto.sync_customer !== false
        ? await this.ensureCustomer(
            {
              ...updateDto,
              customer_id:
                updateDto.customer_id ?? appointment.customer_id ?? undefined,
            },
            vehicleRecordId,
            actor,
          )
        : (appointment.customer_id ?? undefined);

    // Only the appointment's own columns are merged — booking_type is left
    // untouched unless explicitly provided (#5: never silently flip Walk-in).
    const merged = this.appointmentDao.merge(appointment, {
      ...(updateDto.anpr_capture_id !== undefined
        ? { anpr_capture_id: updateDto.anpr_capture_id }
        : {}),
      ...(customerId !== undefined ? { customer_id: customerId } : {}),
      ...(vehicleRecordId !== undefined
        ? { vehicle_record_id: vehicleRecordId }
        : {}),
      ...(updateDto.centre_id !== undefined
        ? { centre_id: updateDto.centre_id }
        : {}),
      ...(updateDto.line_id !== undefined
        ? { line_id: updateDto.line_id }
        : {}),
      ...(updateDto.booking_type !== undefined
        ? { booking_type: updateDto.booking_type }
        : {}),
      ...(updateDto.status !== undefined ? { status: updateDto.status } : {}),
      ...(updateDto.notes !== undefined ? { notes: updateDto.notes } : {}),
      ...(updateDto.appointment_at
        ? { appointment_at: new Date(updateDto.appointment_at) }
        : {}),
    });

    const beforeDetails = this.buildAuditDetailsFromEntity(appointment);
    const afterDetails = this.buildAuditDetailsFromDto(
      updateDto,
      appointment,
      beforeDetails,
    );
    this.attachAuditDetails(merged, afterDetails);
    (merged as AppointmentAuditEntity).__auditDetailBefore = beforeDetails;
    patchAuditContext({
      appointmentAuditDetails: { ...afterDetails },
      appointmentAuditDetailsBefore: { ...beforeDetails },
    });

    try {
      const saved = await this.appointmentDao.save(merged);
      return (await this.appointmentDao.findActiveById(saved.id)) ?? saved;
    } finally {
      patchAuditContext({
        appointmentAuditDetails: null,
        appointmentAuditDetailsBefore: null,
      });
    }
  }

  async remove(id: string): Promise<void> {
    const appointment = await this.findOne(id);

    // A converted appointment owns a job, and for an online booking the payment
    // recorded against it. This is a soft delete, so those rows would survive
    // and keep pointing at a parent the UI no longer shows — the job would go
    // on being worked while its appointment had vanished. Refuse, and let the
    // operator delete the job instead if the work genuinely needs undoing.
    if (appointment.status === AppointmentStatus.CONVERTED) {
      throw new BadRequestException(
        'This appointment has been converted to a job and cannot be deleted. Delete the job instead.',
      );
    }

    const details = await this.buildAuditDetailsForDelete(appointment);
    this.attachAuditDetails(appointment, details);
    appointment.is_deleted = true;
    patchAuditContext({ appointmentAuditDetails: { ...details } });
    try {
      await this.appointmentDao.save(appointment);
    } finally {
      patchAuditContext({
        appointmentAuditDetails: null,
        appointmentAuditDetailsBefore: null,
      });
    }
  }

  private attachAuditDetails(
    appointment: Appointment,
    details: AppointmentAuditDetails,
  ): void {
    Object.assign(appointment as AppointmentAuditEntity, details);
  }

  /**
   * DELETE snapshot: entity relations + prior CREATE/UPDATE audit for fields
   * that are not columns on appointments (esp. Vehicle Category).
   */
  private async buildAuditDetailsForDelete(
    appointment: Appointment,
  ): Promise<AppointmentAuditDetails> {
    const details = this.buildAuditDetailsFromEntity(appointment);
    if (details.charge_category_id) {
      return details;
    }

    const prior = await this.auditLogDao.findLatestEntityDetailSnapshot(
      'Appointment',
      appointment.id,
    );
    if (!prior) {
      return details;
    }

    return {
      ...details,
      customer_name:
        details.customer_name ??
        (prior.customer_name as string | null | undefined) ??
        null,
      customer_phone:
        details.customer_phone ??
        (prior.customer_phone as string | null | undefined) ??
        (prior.owner_phone_number as string | null | undefined) ??
        null,
      owner_name:
        details.owner_name ??
        (prior.owner_name as string | null | undefined) ??
        null,
      driver_phone_number:
        details.driver_phone_number ??
        (prior.driver_phone_number as string | null | undefined) ??
        null,
      mulkiya_id:
        details.mulkiya_id ??
        (prior.mulkiya_id as string | null | undefined) ??
        null,
      plate_number:
        details.plate_number ??
        (prior.plate_number as string | null | undefined) ??
        null,
      plate_color:
        details.plate_color ??
        (prior.plate_color as string | null | undefined) ??
        null,
      vehicle_type:
        details.vehicle_type ??
        (prior.vehicle_type as string | null | undefined) ??
        null,
      charge_category_id:
        details.charge_category_id ??
        (prior.charge_category_id as string | null | undefined) ??
        null,
      chassis_no:
        details.chassis_no ??
        (prior.chassis_no as string | null | undefined) ??
        null,
    };
  }

  private buildAuditDetailsFromEntity(
    appointment: Appointment,
  ): AppointmentAuditDetails {
    const customer = appointment.customer;
    const vehicle = appointment.vehicleRecord;
    const capture = appointment.anprCapture;
    return {
      // Customer name is not a separate DB column — fall back to owner name.
      customer_name: customer?.owner_name ?? null,
      customer_phone: customer?.owner_phone_number ?? null,
      owner_name: customer?.owner_name ?? null,
      driver_phone_number: customer?.driver_phone_number ?? null,
      mulkiya_id: customer?.mulkiya_id ?? null,
      plate_number:
        vehicle?.plate_number ??
        capture?.plate_number ??
        customer?.plate_number ??
        null,
      plate_color: vehicle?.plate_color ?? capture?.plate_color ?? null,
      vehicle_type: vehicle?.vehicle_type ?? capture?.vehicle_type ?? null,
      charge_category_id: vehicle?.vehicleMaster?.charge_category_id ?? null,
      chassis_no: vehicle?.chassis_no ?? customer?.chassis_no ?? null,
    };
  }

  private buildAuditDetailsFromDto(
    dto: UpdateAppointmentDto,
    appointment: Appointment,
    fallback: AppointmentAuditDetails,
  ): AppointmentAuditDetails {
    const capture = appointment.anprCapture;
    return {
      customer_name: dto.customer_name ?? fallback.customer_name ?? null,
      customer_phone: dto.customer_phone ?? fallback.customer_phone ?? null,
      owner_name:
        dto.owner_name ?? dto.customer_name ?? fallback.owner_name ?? null,
      driver_phone_number:
        dto.driver_phone ?? fallback.driver_phone_number ?? null,
      mulkiya_id: dto.mulkiya_id ?? fallback.mulkiya_id ?? null,
      plate_number: dto.plate_number ?? fallback.plate_number ?? null,
      plate_color:
        dto.plate_color ?? capture?.plate_color ?? fallback.plate_color ?? null,
      vehicle_type:
        dto.vehicle_type ??
        capture?.vehicle_type ??
        fallback.vehicle_type ??
        null,
      charge_category_id:
        dto.charge_category_id ?? fallback.charge_category_id ?? null,
      chassis_no: dto.chassis_no ?? fallback.chassis_no ?? null,
    };
  }

  /**
   * Ensure a vehicle record exists for the plate and reflects the latest vehicle
   * type / chassis (ANPR or operator entered). Returns the record id, or the
   * passed id / undefined when there is no plate to resolve.
   */
  /**
   * Links the plate's vehicle master to the type and category the operator
   * chose, and returns its id.
   *
   * Job pricing reads the category off the MASTER
   * (`job.vehicleRecord.vehicleMaster.charge_category_id`), not off the
   * appointment — and the appointment has no column for it at all, so the
   * wizard's choice used to reach the audit log and nowhere else. Without this
   * the job screen opened with the category unselected and priced the job by
   * vehicle type alone, discarding a decision the operator had already made.
   *
   * Unlike the ANPR path this derives nothing: the operator picked both, and a
   * guess would only overwrite a real answer with a worse one.
   */
  private async ensureVehicleMaster(
    plate: string,
    vehicleType: string | undefined,
    chargeCategoryId: string | undefined,
    chassisNo: string | undefined,
    actor: UserContext,
  ): Promise<string | undefined> {
    const code = plate.trim();
    if (!code) return undefined;

    const existing = await this.vehicleDao.findByCode(code);
    const enrich = {
      vehicle_type: vehicleType ?? existing?.vehicle_type,
      vin_no: chassisNo ?? existing?.vin_no,
      charge_category_id:
        chargeCategoryId ?? existing?.charge_category_id ?? null,
    };

    if (!existing) {
      const created = await this.vehicleDao.save(
        this.vehicleDao.create({
          id: generateSnowflakeId(),
          vehicle_id: await this.vehicleDao.getNextVehicleId(),
          name: code,
          code,
          status: 'Active',
          ...enrich,
          created_by: getCreatedById(actor),
        }),
      );
      return created.id;
    }

    return (await this.vehicleDao.save(this.vehicleDao.merge(existing, enrich)))
      .id;
  }

  private async ensureVehicleRecord(
    existingRecordId: string | null | undefined,
    plateNumber: string | undefined,
    vehicleType: string | undefined,
    chassisNo: string | undefined,
    actor: UserContext,
    plateColor?: string,
    vehicleColor?: string,
    vehicleMake?: string,
    vehicleModel?: string,
    chargeCategoryId?: string,
  ): Promise<string | undefined> {
    if (existingRecordId) {
      const record =
        await this.vehicleRecordDao.findActiveById(existingRecordId);
      if (record) {
        const masterId = await this.ensureVehicleMaster(
          record.plate_number,
          vehicleType,
          chargeCategoryId,
          chassisNo,
          actor,
        );
        const merged = this.vehicleRecordDao.merge(record, {
          vehicle_type: vehicleType ?? record.vehicle_type,
          chassis_no: chassisNo ?? record.chassis_no,
          plate_color: plateColor ?? record.plate_color,
          vehicle_color: vehicleColor ?? record.vehicle_color,
          // Incoming value wins only when present, so a later appointment
          // without ROP data cannot blank what an earlier one established.
          vehicle_make: vehicleMake ?? record.vehicle_make,
          vehicle_model: vehicleModel ?? record.vehicle_model,
          vehicle_master_id: masterId ?? record.vehicle_master_id ?? null,
        });
        const saved = await this.vehicleRecordDao.save(merged);
        return saved.id;
      }
    }

    const plate = plateNumber?.trim();
    if (!plate) return existingRecordId ?? undefined;

    // Resolved once and shared by both remaining paths — the master is keyed by
    // plate, so it is the same row whether the record already exists or not.
    const masterId = await this.ensureVehicleMaster(
      plate,
      vehicleType,
      chargeCategoryId,
      chassisNo,
      actor,
    );

    const found = await this.vehicleRecordDao.findByPlateNumber(plate);
    if (found) {
      const merged = this.vehicleRecordDao.merge(found, {
        vehicle_type: vehicleType ?? found.vehicle_type,
        chassis_no: chassisNo ?? found.chassis_no,
        plate_color: plateColor ?? found.plate_color,
        vehicle_color: vehicleColor ?? found.vehicle_color,
        vehicle_make: vehicleMake ?? found.vehicle_make,
        vehicle_model: vehicleModel ?? found.vehicle_model,
        vehicle_master_id: masterId ?? found.vehicle_master_id ?? null,
      });
      const saved = await this.vehicleRecordDao.save(merged);
      return saved.id;
    }

    const created = await this.vehicleRecordDao.save(
      this.vehicleRecordDao.create({
        id: generateSnowflakeId(),
        vehicle_record_id: await this.vehicleRecordDao.getNextVehicleRecordId(),
        plate_number: plate,
        vehicle_type: vehicleType,
        chassis_no: chassisNo,
        plate_color: plateColor,
        vehicle_color: vehicleColor,
        vehicle_make: vehicleMake,
        vehicle_model: vehicleModel,
        vehicle_master_id: masterId ?? null,
        created_by: getCreatedById(actor),
      }),
    );
    return created.id;
  }

  /**
   * Create or update the customer from the entered details and link it to the
   * vehicle record. Returns the customer id (always set so the appointment can
   * reference it).
   */
  private async ensureCustomer(
    dto: Partial<
      Pick<
        CreateAppointmentDto,
        | 'customer_id'
        | 'customer_name'
        | 'customer_phone'
        | 'id_number'
        | 'owner_name'
        | 'owner_phone'
        | 'driver_name'
        | 'driver_phone'
        | 'mulkiya_id'
        | 'chassis_no'
        | 'plate_number'
      >
    >,
    vehicleRecordId: string | undefined,
    actor: UserContext,
  ): Promise<string> {
    if (dto.customer_id) {
      const customer = await this.customerDao.findActiveById(dto.customer_id);
      if (!customer) {
        throw new ResourceNotFoundException('Customer', dto.customer_id);
      }
      const merged = this.customerDao.merge(customer, {
        owner_name: dto.owner_name ?? dto.customer_name ?? customer.owner_name,
        owner_phone_number:
          dto.owner_phone ?? dto.customer_phone ?? customer.owner_phone_number,
        driver_name: dto.driver_name ?? customer.driver_name,
        driver_phone_number: dto.driver_phone ?? customer.driver_phone_number,
        plate_number: dto.plate_number ?? customer.plate_number,
        // id_number is a system-generated code — backfill it if the row lacks one.
        id_number: customer.id_number ?? dto.id_number ?? generateIdNumber(),
        chassis_no: dto.chassis_no ?? customer.chassis_no,
        mulkiya_id: dto.mulkiya_id ?? customer.mulkiya_id,
        vehicle_record_id: vehicleRecordId ?? customer.vehicle_record_id,
      });
      const saved = await this.customerDao.save(merged);
      return saved.id;
    }

    if (!dto.customer_name || !dto.customer_phone) {
      throw new DatabaseException(
        'Customer name and phone are required to create a customer.',
      );
    }

    const customer = this.customerDao.create({
      id: generateSnowflakeId(),
      customer_id: await this.customerDao.getNextCustomerId(),
      // id_number is a system-generated nanoid-style code (not user entered).
      id_number: dto.id_number ?? generateIdNumber(),
      owner_name: dto.owner_name ?? dto.customer_name,
      owner_phone_number: dto.owner_phone ?? dto.customer_phone,
      // Driver defaults to the owner/customer when not provided.
      driver_name: dto.driver_name ?? dto.owner_name ?? dto.customer_name,
      driver_phone_number: dto.driver_phone,
      plate_number: dto.plate_number,
      chassis_no: dto.chassis_no,
      mulkiya_id: dto.mulkiya_id,
      vehicle_record_id: vehicleRecordId,
      created_by: getCreatedById(actor),
    });
    const saved = await this.customerDao.save(customer);
    return saved.id;
  }

  private async validateReferences(
    dto: Partial<
      Pick<
        CreateAppointmentDto,
        | 'anpr_capture_id'
        | 'centre_id'
        | 'line_id'
        | 'customer_id'
        | 'payment_type_id'
      >
    >,
  ): Promise<void> {
    if (dto.anpr_capture_id) {
      const capture = await this.anprCaptureDao.findActiveById(
        dto.anpr_capture_id,
      );
      if (!capture) {
        throw new ResourceNotFoundException('AnprCapture', dto.anpr_capture_id);
      }
    }
    if (dto.centre_id) {
      const centre = await this.centreDao.findActiveById(dto.centre_id);
      if (!centre) {
        throw new ResourceNotFoundException('Centre', dto.centre_id);
      }
    }
    if (dto.line_id) {
      const line = await this.lineDao.findActiveById(dto.line_id);
      if (!line) {
        throw new ResourceNotFoundException('Line', dto.line_id);
      }
    }
    if (dto.customer_id) {
      const customer = await this.customerDao.findActiveById(dto.customer_id);
      if (!customer) {
        throw new ResourceNotFoundException('Customer', dto.customer_id);
      }
    }
    if (dto.payment_type_id) {
      const paymentType = await this.paymentTypeDao.findActiveById(
        dto.payment_type_id,
      );
      if (!paymentType) {
        throw new ResourceNotFoundException('PaymentType', dto.payment_type_id);
      }
    }
  }
}
