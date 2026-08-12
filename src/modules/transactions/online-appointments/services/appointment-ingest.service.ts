import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { AppLogger } from '../../../../common/logger/app.logger';
import { generateSnowflakeId } from '../../../../common/shared/snowflakeIdGeneration';
import {
  AppointmentStatus,
  BookingType,
} from '../../../../common/enums/common.enums';
import { CentreDao } from '../../../database/dao/centre.dao';
import { AppointmentDao } from '../../../database/dao/appointment.dao';
import { AppointmentBookingDao } from '../../../database/dao/appointment-booking.dao';
import { VehicleRecordDao } from '../../../database/dao/vehicle-record.dao';
import { CustomerDao } from '../../../database/dao/customer.dao';
import { AppointmentBooking } from '../../../database/entity/appointment-booking.entity';
import { Centre } from '../../../database/entity/centre.entity';
import { Appointment } from '../../../database/entity/appointment.entity';
import { AppointmentApiClientService } from '../../../../common/integrations/appointments/appointment-api-client.service';
import { AppointmentBooking as ProviderBooking } from '../../../../common/integrations/appointments/appointment.types';

/**
 * Today is the operational day — its queue is what staff are working from, so
 * it is pulled every minute.
 */
const TODAY_INTERVAL_MS = 60_000;

/**
 * Future days change far less urgently: a booking made or cancelled for next
 * Tuesday does not need sub-minute freshness, and the provider serves one
 * day per call, so polling the whole window at 60s would be mostly waste.
 */
const UPCOMING_INTERVAL_MS = 5 * 60_000;

/**
 * How many days ahead to mirror, today inclusive. A booking must exist locally
 * before the vehicle arrives, and customers book days ahead — pulling only
 * today would mean tomorrow's booking is invisible until tomorrow.
 */
const WINDOW_DAYS = 7;

/**
 * Pulls the provider's bookings into IVIS on a schedule.
 *
 * Two steps per cycle, deliberately separate:
 *
 *   1. INGEST  — upsert every booking into `appointment_bookings` verbatim,
 *                keyed by the provider's booking_id.
 *   2. PROMOTE — create a local `Appointment` (Online, Queued, no capture) for
 *                any booking that has not got one yet.
 *
 * Splitting them means a promotion that fails mid-cycle is retried next tick
 * from the stored raw row, rather than needing another provider call.
 *
 * The promoted appointment is a *placeholder*: the vehicle has not arrived, so
 * it carries no ANPR capture, vehicle record or customer. CaptureValidation
 * fills those in when the camera reads the plate.
 *
 * Disable with `APPOINTMENT_INGEST_DISABLED=true`.
 */
@Injectable()
export class AppointmentIngestService {
  private static readonly context = 'AppointmentIngestService';

  constructor(
    private readonly centreDao: CentreDao,
    private readonly appointmentDao: AppointmentDao,
    private readonly bookingDao: AppointmentBookingDao,
    private readonly vehicleRecordDao: VehicleRecordDao,
    private readonly customerDao: CustomerDao,
    private readonly appointmentApi: AppointmentApiClientService,
    private readonly logger: AppLogger,
  ) {}

  /** Today only — the queue staff are actively working from. */
  @Interval(TODAY_INTERVAL_MS)
  async runToday(): Promise<void> {
    await this.runWindow(0, 1, 'today');
  }

  /** Tomorrow through the end of the window, on a slower cadence. */
  @Interval(UPCOMING_INTERVAL_MS)
  async runUpcoming(): Promise<void> {
    await this.runWindow(1, WINDOW_DAYS, 'upcoming');
  }

  /** Pulls days [offsetFrom, offsetTo) ahead of today for every linked centre. */
  private async runWindow(
    offsetFrom: number,
    offsetTo: number,
    label: string,
  ): Promise<void> {
    if (process.env.APPOINTMENT_INGEST_DISABLED === 'true') return;

    try {
      const centres = await this.centreDao.findAllWithProviderBranchCode();
      for (const centre of centres) {
        for (let offset = offsetFrom; offset < offsetTo; offset++) {
          await this.ingestCentre(centre, this.dayInOman(offset));
        }
      }
    } catch (err) {
      // Never throw from a scheduled job — a provider outage must not take the
      // interval down with it.
      this.logger.warn(
        `Appointment ingest (${label}) failed: ${(err as Error).message}`,
        AppointmentIngestService.context,
      );
    }
  }

  /** Pulls the whole window now, for a manual refresh. */
  async refreshNow(centre: Centre): Promise<void> {
    for (let offset = 0; offset < WINDOW_DAYS; offset++) {
      await this.ingestCentre(centre, this.dayInOman(offset));
    }
  }

  /** One centre's day: pull, upsert, reconcile withdrawals, then promote. */
  async ingestCentre(centre: Centre, date?: string): Promise<void> {
    const branchCode = centre.provider_branch_code?.trim();
    if (!branchCode) return;

    const bookings = await this.appointmentApi.fetchAppointments(
      branchCode,
      date,
    );
    if (!bookings) {
      // null means the call failed — distinct from an empty day, so do NOT
      // withdraw anything here or an outage would wipe the local view.
      return;
    }

    const day = date ?? bookings[0]?.appointment_date ?? this.dayInOman(0);
    const seenIds = new Set<string>();

    for (const booking of bookings) {
      seenIds.add(booking.booking_id);
      await this.upsertBooking(centre, branchCode, booking);
    }

    await this.withdrawMissing(centre.id, day, seenIds);
    await this.promotePending(centre);
    await this.syncPromoted(centre.id, day);
  }

  /** Insert or refresh one raw booking row. */
  private async upsertBooking(
    centre: Centre,
    branchCode: string,
    booking: ProviderBooking,
  ): Promise<void> {
    const existing = await this.bookingDao.findByBookingId(booking.booking_id);
    const now = new Date();

    if (existing) {
      existing.provider_status = booking.status;
      existing.payload = booking as unknown as Record<string, unknown>;
      existing.booking_date = booking.appointment_date;
      existing.booking_time = booking.appointment_time ?? null;
      existing.last_seen_at = now;
      // Reappearing after a withdrawal means it was reinstated upstream.
      existing.is_withdrawn = false;
      await this.bookingDao.save(existing);
      return;
    }

    await this.bookingDao.save(
      this.bookingDao.create({
        id: generateSnowflakeId(),
        booking_id: booking.booking_id,
        centre_id: centre.id,
        provider_branch_code: branchCode,
        booking_date: booking.appointment_date,
        booking_time: booking.appointment_time ?? null,
        plate_number: booking.vehicle.plate_number,
        plate_type: booking.vehicle.plate_type,
        provider_status: booking.status,
        payload: booking as unknown as Record<string, unknown>,
        first_seen_at: now,
        last_seen_at: now,
      }),
    );
  }

  /**
   * Bookings we hold for this day that the provider no longer returns — a
   * cancellation. Marked, never deleted: an operator may already have acted on
   * the promoted appointment.
   */
  private async withdrawMissing(
    centreId: string,
    day: string,
    seenIds: Set<string>,
  ): Promise<void> {
    const held = await this.bookingDao.findByCentreAndDate(centreId, day);
    const gone = held.filter(
      (b) => !b.is_withdrawn && !seenIds.has(b.booking_id),
    );
    if (gone.length === 0) return;

    await this.bookingDao.markWithdrawn(gone.map((b) => b.id));
    this.logger.log(
      `${gone.length} booking(s) withdrawn upstream for centre ${centreId} on ${day}`,
      AppointmentIngestService.context,
    );
  }

  /** Creates the local appointment for any booking still lacking one. */
  private async promotePending(centre: Centre): Promise<void> {
    const pending = await this.bookingDao.findPendingPromotion(centre.id);

    for (const booking of pending) {
      try {
        await this.promote(centre, booking);
      } catch (err) {
        this.logger.warn(
          `Failed to promote booking ${booking.booking_id}: ${(err as Error).message}`,
          AppointmentIngestService.context,
        );
      }
    }
  }

  private async promote(
    centre: Centre,
    booking: AppointmentBooking,
  ): Promise<void> {
    // Another cycle (or a concurrent instance) may already have promoted it —
    // the unique index on provider_booking_id is the real guard, this just
    // avoids the round trip.
    const existing = await this.appointmentDao.findByProviderBookingId(
      booking.booking_id,
    );
    if (existing) {
      booking.appointment_id = existing.id;
      await this.bookingDao.save(booking);
      return;
    }

    // The booking payload already carries vehicle, customer and payment detail,
    // so the queue is populated before the car arrives rather than showing a
    // bare plate. ROP still overwrites the vehicle/owner facts on arrival —
    // it is the government record — but this fills the gap until then.
    const payload = booking.payload as unknown as ProviderBooking;
    const vehicleRecordId = await this.ensureVehicleRecord(booking, payload);
    const customerId = await this.ensureCustomer(payload, vehicleRecordId);

    const appointment = this.appointmentDao.create({
      id: generateSnowflakeId(),
      appointment_id: await this.appointmentDao.getNextAppointmentId(),
      centre_id: centre.id,
      provider_booking_id: booking.booking_id,
      plate_number: booking.plate_number,
      booking_type: BookingType.ONLINE,
      status: AppointmentStatus.QUEUED,
      appointment_at: this.toInstant(
        booking.booking_date,
        booking.booking_time,
      ),
      vehicle_record_id: vehicleRecordId,
      customer_id: customerId,
      // No capture and no lane yet — the vehicle has not arrived, and which
      // lane it uses is only known on arrival.
      anpr_capture_id: null,
      line_id: null,
      // What the provider says about payment. Deliberately NOT a Payment row:
      // a payment belongs to a job, and no job exists for a car that has not
      // arrived. Job creation reads these to decide it can proceed.
      provider_status: payload?.status ?? booking.provider_status,
      provider_payment_status: payload?.payment_status ?? null,
      provider_fee_amount: payload?.fee_amount ?? null,
      provider_payment_method: payload?.payment_method ?? null,
      provider_payment_reference: payload?.payment_reference ?? null,
      is_reinspection: payload?.is_reinspection ?? false,
      assigned_lane: payload?.assigned_lane ?? null,
    });
    const saved = await this.appointmentDao.save(appointment);

    booking.appointment_id = saved.id;
    await this.bookingDao.save(booking);

    this.logger.log(
      `Promoted booking ${booking.booking_id} (${booking.plate_number}) → appointment ${saved.id}`,
      AppointmentIngestService.context,
    );
  }

  /**
   * Combines the provider's Oman-local date and wall clock into an instant.
   * The provider serves Asia/Muscat (UTC+4) with no DST, so the offset is
   * fixed — appending it is exact, unlike relying on the server's zone.
   */
  private toInstant(date: string, time?: string | null): Date {
    const wall = time && /^\d{2}:\d{2}$/.test(time) ? time : '00:00';
    return new Date(`${date}T${wall}:00+04:00`);
  }

  /**
   * Vehicle record for the booked plate, created from the provider's details
   * if we have not seen the plate before. ROP enriches this on arrival; until
   * then the booking is the only source we have.
   */
  private async ensureVehicleRecord(
    booking: AppointmentBooking,
    payload: ProviderBooking | undefined,
  ): Promise<string | null> {
    const plate = booking.plate_number?.trim();
    if (!plate) return null;

    const existing = await this.vehicleRecordDao.findByPlateNumber(plate);
    if (existing) return existing.id;

    const vehicle = payload?.vehicle;
    const created = await this.vehicleRecordDao.save(
      this.vehicleRecordDao.create({
        id: generateSnowflakeId(),
        vehicle_record_id: await this.vehicleRecordDao.getNextVehicleRecordId(),
        plate_number: plate,
        chassis_no: vehicle?.chassis_number ?? vehicle?.vin ?? undefined,
        vehicle_make: vehicle?.make ?? undefined,
        vehicle_model: vehicle?.model ?? undefined,
        vehicle_type: vehicle?.plate_type ?? undefined,
        vehicle_color: vehicle?.color ?? undefined,
        created_by: 'appointment-ingest',
      }),
    );
    return created.id;
  }

  /**
   * Customer from the booking, reused when one already exists for this vehicle.
   *
   * Skipped when the provider sends no phone: owner_phone_number is NOT NULL
   * and an empty one fails the walk-in form's validation anyway, so a
   * half-made customer would only block the operator later.
   */
  private async ensureCustomer(
    payload: ProviderBooking | undefined,
    vehicleRecordId: string | null,
  ): Promise<string | null> {
    const name = payload?.customer?.name?.trim();
    const phone = payload?.customer?.phone?.trim();
    if (!name || !phone || !vehicleRecordId) return null;

    const existing =
      await this.customerDao.findByVehicleRecordId(vehicleRecordId);
    if (existing) return existing.id;

    const created = await this.customerDao.save(
      this.customerDao.create({
        id: generateSnowflakeId(),
        customer_id: await this.customerDao.getNextCustomerId(),
        owner_name: name,
        owner_phone_number: phone,
        // The provider also sends an email, but Customer has no column for it
        // — it stays recoverable in appointment_bookings.payload.
        vehicle_record_id: vehicleRecordId,
        created_by: 'appointment-ingest',
      }),
    );
    return created.id;
  }

  /**
   * Reconciles already-promoted appointments with what the provider now says.
   *
   * Bookings change after we first see them: a customer cancels, reschedules,
   * or checks in. Without this the local row is a snapshot frozen at promotion
   * time, and the queue slowly diverges from reality.
   *
   * Three cases are handled, in order of consequence:
   *
   *   • WITHDRAWN — the booking vanished upstream (a cancellation). Auto-cancel
   *     ONLY while nothing has acted on it; see canAutoCancel.
   *   • RESCHEDULED — date or time moved, so appointment_at must follow or the
   *     queue shows the wrong slot.
   *   • REINSTATED — a previously withdrawn booking came back; un-cancel it.
   */
  private async syncPromoted(centreId: string, day: string): Promise<void> {
    const held = await this.bookingDao.findByCentreAndDate(centreId, day);

    for (const booking of held) {
      if (!booking.appointment_id) continue;

      const appointment = await this.appointmentDao.findOne({
        where: { id: booking.appointment_id },
      });
      if (!appointment || appointment.is_deleted) continue;

      if (booking.is_withdrawn) {
        await this.handleWithdrawn(booking, appointment);
        continue;
      }

      const changed: string[] = [];

      // Reinstated upstream after a cancellation.
      if (appointment.status === AppointmentStatus.CANCELLED) {
        appointment.status = AppointmentStatus.QUEUED;
        changed.push('status');
      }

      // Rescheduled — only meaningful while the car has not arrived; once it
      // is here, the physical arrival is the truth, not the booked slot.
      if (!appointment.anpr_capture_id) {
        const slot = this.toInstant(booking.booking_date, booking.booking_time);
        if (appointment.appointment_at?.getTime() !== slot.getTime()) {
          appointment.appointment_at = slot;
          changed.push('appointment_at');
        }
      }

      if (changed.length > 0) {
        await this.appointmentDao.save(appointment);
        this.logger.log(
          `Synced appointment ${appointment.id} from booking ${booking.booking_id}: ${changed.join(', ')}`,
          AppointmentIngestService.context,
        );
      }
    }
  }

  /**
   * A booking withdrawn upstream. The system reverses only what the system
   * created: an untouched placeholder is cancelled automatically, but once a
   * camera or a person has acted on it, cancelling could discard real work — so
   * it is left alone and logged for an operator to resolve.
   */
  private async handleWithdrawn(
    booking: AppointmentBooking,
    appointment: Appointment,
  ): Promise<void> {
    if (appointment.status === AppointmentStatus.CANCELLED) return;

    if (this.canAutoCancel(appointment)) {
      await this.appointmentDao.update(appointment.id, {
        status: AppointmentStatus.CANCELLED,
      });
      this.logger.log(
        `Auto-cancelled appointment ${appointment.id} — booking ${booking.booking_id} withdrawn upstream`,
        AppointmentIngestService.context,
      );
      return;
    }

    this.logger.warn(
      `Booking ${booking.booking_id} withdrawn upstream but appointment ${appointment.id} has already been acted on (status ${appointment.status}, capture ${appointment.anpr_capture_id ?? 'none'}) — left for an operator to resolve`,
      AppointmentIngestService.context,
    );
  }

  /**
   * Safe to cancel automatically only while the appointment is an untouched
   * placeholder: still queued, no vehicle arrived, and not already converted
   * into a job.
   */
  private canAutoCancel(appointment: Appointment): boolean {
    return (
      appointment.status === AppointmentStatus.QUEUED &&
      !appointment.anpr_capture_id
    );
  }

  /** YYYY-MM-DD, `offset` days from today, in Oman local time. */
  private dayInOman(offset: number): string {
    const base = new Date();
    base.setUTCDate(base.getUTCDate() + offset);
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Muscat',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(base);
  }
}
