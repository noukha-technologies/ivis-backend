import { Injectable } from '@nestjs/common';
import { AppLogger } from '../../logger/app.logger';
import { OnlineAppointmentResult } from '../../interfaces/common.interfaces';
import {
  APPOINTMENT_BRANCHES_PATH,
  APPOINTMENT_DUPLICATE_CODE,
  APPOINTMENT_EVENTS_PATH,
  APPOINTMENT_SUCCESS_CODE,
  RECONCILE_BATCH_LIMIT,
  REQUEST_TIMEOUT_MS,
  appointmentApiKey,
  appointmentBaseUrl,
} from './appointment.constants';
import {
  AppointmentBooking,
  AppointmentBranch,
  AppointmentEnvelope,
  BookingListResponse,
  BranchListResponse,
  EventStatusResult,
  PushOutcome,
  ReconcileResponse,
  SingleBookingResponse,
  TajdeedEventEnvelope,
} from './appointment.types';

/**
 * Read-side client for the appointment provider (Tajdeed VIS API): the branch
 * and lane directory, plus the three booking lookups.
 *
 * Auth is a single GLOBAL key held in the environment, valid for every active
 * branch. Because that key does not identify a branch on its own, every
 * branch-scoped request carries `branch_code` explicitly — omitting it is
 * E0003. The branch code comes from the centre being queried
 * (`Centre.provider_branch_code`).
 *
 * Every method resolves to null rather than throwing. The provider being
 * unreachable, unconfigured, or answering with a failure code must degrade the
 * caller (walk-in instead of online, verification skipped) rather than fail the
 * whole request.
 *
 * Config (env): `APPOINTMENT_API_BASE_URL`, `APPOINTMENT_API_KEY`.
 */
@Injectable()
export class AppointmentApiClientService {
  private static readonly context = 'AppointmentApiClientService';

  constructor(private readonly logger: AppLogger) {}

  /**
   * The branch/lane directory — the authoritative source for branch codes and
   * the lane ids configured at each branch, which must never be hardcoded.
   * With the global key this returns every active branch, which is what backs
   * the branch picker during centre setup. Inactive branches and lanes are
   * omitted by the provider.
   */
  async fetchBranches(): Promise<AppointmentBranch[] | null> {
    const body = await this.get<BranchListResponse>(APPOINTMENT_BRANCHES_PATH);
    return body?.branches ?? null;
  }

  /**
   * One branch by code. Null means the provider does not have it — either the
   * code is wrong, or that branch has not been provisioned yet.
   */
  async fetchBranch(branchCode: string): Promise<AppointmentBranch | null> {
    const branches = await this.fetchBranches();
    if (!branches) return null;

    const wanted = branchCode.trim().toUpperCase();
    return (
      branches.find((b) => b.branch_code.trim().toUpperCase() === wanted) ??
      null
    );
  }

  /** One branch's bookings for one day, defaulting to today in Oman time. */
  async fetchAppointments(
    branchCode: string,
    date?: string,
  ): Promise<AppointmentBooking[] | null> {
    const body = await this.get<BookingListResponse>('/appointments', {
      branch_code: branchCode,
      date,
    });
    return body?.appointments ?? null;
  }

  /**
   * One booking by the provider's booking number. Booking numbers are globally
   * unique, so this endpoint takes no branch_code.
   */
  async fetchByBookingId(
    bookingId: string,
  ): Promise<AppointmentBooking | null> {
    const body = await this.get<SingleBookingResponse>(
      `/appointments/${encodeURIComponent(bookingId)}`,
    );
    return body?.appointment ?? null;
  }

  /**
   * The lane lookup: what to call when a camera reads a plate. Matches on
   * normalized plate, plate type, branch and day, and only statuses
   * CHECKED_IN or IN_PROGRESS — a vehicle that has not arrived, or has already
   * finished, is not at the lane and comes back 404 → null. That null is the
   * normal answer for a walk-in, not an error.
   *
   * A vehicle is the PAIR (plate_number, plate_type): the same number under
   * two plate types is two genuinely different vehicles, so plate_type is a
   * required path segment rather than an optional filter.
   */
  async fetchByPlate(
    branchCode: string,
    plateType: string,
    plateNumber: string,
    date?: string,
  ): Promise<AppointmentBooking | null> {
    const body = await this.get<SingleBookingResponse>(
      `/appointments/by-plate/${encodeURIComponent(plateType)}/${encodeURIComponent(plateNumber)}`,
      { branch_code: branchCode, date },
    );
    return body?.appointment ?? null;
  }

  /**
   * Plate lookup reduced to the fields the ANPR intake path needs, so callers
   * that only decide Online vs Walk-in do not carry the full booking shape.
   * Returns null when the plate has no live booking at the lane.
   */
  async findByPlate(
    branchCode: string,
    plateType: string,
    plateNumber: string,
  ): Promise<OnlineAppointmentResult | null> {
    const booking = await this.fetchByPlate(branchCode, plateType, plateNumber);
    if (!booking) return null;

    return {
      plate_number: booking.vehicle.plate_number,
      customer_name: booking.customer?.name,
      customer_phone: booking.customer?.phone || undefined,
      chassis_no: booking.vehicle.chassis_number ?? undefined,
      vehicle_type: booking.vehicle.plate_type,
      // The provider splits the slot into an Oman-local date and wall clock;
      // recombine so callers get one parseable instant.
      appointment_at: `${booking.appointment_date}T${booking.appointment_time}:00`,
    };
  }

  /**
   * Pushes one event. Unlike the read path this reports a three-way outcome,
   * because the caller must be able to tell "delivered" from "try again" from
   * "never retry" — see PushOutcome.
   *
   * E0007 (duplicate transaction_id) counts as SUCCESS: it means the provider
   * already holds this event, so a retry that races an earlier accepted send
   * settles rather than looping. It says nothing about whether processing
   * succeeded — that is what fetchEventStatus is for.
   */
  async pushEvent(envelope: TajdeedEventEnvelope): Promise<PushOutcome> {
    const apiKey = appointmentApiKey();
    if (!apiKey) {
      return {
        ok: false,
        retryable: false,
        code: null,
        reason: 'APPOINTMENT_API_KEY is not configured',
      };
    }

    try {
      const res = await fetch(
        `${appointmentBaseUrl()}${APPOINTMENT_EVENTS_PATH}`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(envelope),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      );

      const body = (await res
        .json()
        .catch(() => null)) as AppointmentEnvelope | null;
      const code = body?.status ?? null;
      const message = body?.message ?? `HTTP ${res.status}`;

      // Their exact words, kept on every branch below. `reason` is our summary
      // of it and is what drives retry decisions; this is the evidence an
      // operator sees when they ask why a result was refused.
      const response = (body ?? undefined) as
        | Record<string, unknown>
        | undefined;

      if (res.ok && code === APPOINTMENT_SUCCESS_CODE) {
        return { ok: true, duplicate: false, response };
      }

      if (code === APPOINTMENT_DUPLICATE_CODE) {
        return { ok: true, duplicate: true, response };
      }

      // 429 and 5xx are transient by contract; everything else in the 4xx
      // range will fail identically until the payload or credential changes,
      // so retrying it would be an infinite loop against a fixed answer.
      if (res.status === 429 || res.status >= 500) {
        return {
          ok: false,
          retryable: true,
          reason: `${code ?? res.status}: ${message}`,
          response,
        };
      }

      return {
        ok: false,
        retryable: false,
        code,
        reason: `${code ?? res.status}: ${message}`,
        response,
      };
    } catch (err) {
      // Timeouts and connection failures never reached the provider (or we
      // cannot know), so the same transaction_id must be retried.
      return {
        ok: false,
        retryable: true,
        reason: (err as Error).message,
      };
    }
  }

  /** The provider's outcome for one pushed event. */
  async fetchEventStatus(
    transactionId: string,
  ): Promise<EventStatusResult | null> {
    return this.get<EventStatusResult>(
      `${APPOINTMENT_EVENTS_PATH}/${encodeURIComponent(transactionId)}/status`,
    );
  }

  /**
   * Bulk status probe for sweeping the outbox. The provider caps this at 100
   * ids per call; more is E0004, so the caller must chunk.
   */
  async reconcile(
    transactionIds: string[],
  ): Promise<ReconcileResponse['results'] | null> {
    if (transactionIds.length === 0) return [];

    const body = await this.post<ReconcileResponse>('/reconcile', {
      transaction_ids: transactionIds.slice(0, RECONCILE_BATCH_LIMIT),
    });
    return body?.results ?? null;
  }

  /**
   * Shared POST for the read-shaped endpoints (reconcile). Mirrors get()'s
   * null-on-failure contract; pushEvent deliberately does NOT use this,
   * because an event needs the retry distinction that null erases.
   */
  private async post<T extends AppointmentEnvelope>(
    path: string,
    payload: unknown,
  ): Promise<T | null> {
    const apiKey = appointmentApiKey();
    if (!apiKey) {
      this.logger.warn(
        `APPOINTMENT_API_KEY is not configured — skipping POST ${path}`,
        AppointmentApiClientService.context,
      );
      return null;
    }

    try {
      const res = await fetch(`${appointmentBaseUrl()}${path}`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const body = (await res.json().catch(() => null)) as T | null;

      if (!res.ok || body?.status !== APPOINTMENT_SUCCESS_CODE) {
        this.logger.warn(
          `Appointment API POST ${path} → HTTP ${res.status} ${body?.status ?? ''} ${body?.message ?? ''}`.trim(),
          AppointmentApiClientService.context,
        );
        return null;
      }

      return body;
    } catch (err) {
      this.logger.warn(
        `Appointment API POST ${path} failed: ${(err as Error).message}`,
        AppointmentApiClientService.context,
      );
      return null;
    }
  }

  /**
   * Shared GET: bearer auth, query building and envelope decoding. Returns
   * null on 404 (absent resource), on any non-success provider code, and on
   * transport failure — never throws.
   */
  private async get<T extends AppointmentEnvelope>(
    path: string,
    query?: Record<string, string | undefined>,
  ): Promise<T | null> {
    const apiKey = appointmentApiKey();
    if (!apiKey) {
      this.logger.warn(
        `APPOINTMENT_API_KEY is not configured — skipping GET ${path}`,
        AppointmentApiClientService.context,
      );
      return null;
    }

    try {
      const res = await fetch(this.buildUrl(path, query), {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        // Without this a hung provider hangs the caller indefinitely, which on
        // the ingest path would stall the whole poll cycle.
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (res.status === 404) {
        return null;
      }

      const body = (await res.json().catch(() => null)) as T | null;

      if (!res.ok || body?.status !== APPOINTMENT_SUCCESS_CODE) {
        this.logger.warn(
          `Appointment API GET ${path} → HTTP ${res.status} ${body?.status ?? ''} ${body?.message ?? ''}`.trim(),
          AppointmentApiClientService.context,
        );
        return null;
      }

      return body;
    } catch (err) {
      this.logger.warn(
        `Appointment API GET ${path} failed: ${(err as Error).message}`,
        AppointmentApiClientService.context,
      );
      return null;
    }
  }

  private buildUrl(
    path: string,
    query?: Record<string, string | undefined>,
  ): string {
    const url = `${appointmentBaseUrl()}${path}`;
    if (!query) return url;

    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value) params.append(key, value);
    }

    const qs = params.toString();
    return qs ? `${url}?${qs}` : url;
  }
}
