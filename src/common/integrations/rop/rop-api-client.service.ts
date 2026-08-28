import { Injectable } from '@nestjs/common';
import { AppLogger } from '../../../common/logger/app.logger';
import { toLocalOmanDigits } from '../../utils/oman-phone.util';

export interface RopApiResult {
  owner_name?: string;
  owner_phone?: string;
  driver_name?: string;
  driver_phone?: string;
  mulkiya_id?: string;
  vehicle_make?: string;
  vehicle_model?: string;
  reg_no?: string;
  chassis_no?: string;
  insurance?: string;
  reg_expiry?: Date;
  plate_color?: string;
  vehicle_color?: string;
  vehicle_type?: string;
  /** The full, unmodified API response — kept as proof of the lookup. */
  raw_response?: Record<string, unknown>;
}

/** Shape of the mock ROP API's flat `data` payload (`apis/server.js`). */
interface RopMockApiVehicle {
  plateNumber?: string;
  vinNumber?: string;
  ownerName?: string;
  ownerPhone?: string;
  driverName?: string;
  driverPhone?: string;
  mulkiyaId?: string;
  make?: string;
  model?: string;
  year?: number;
  color?: string;
  fuelType?: string;
  bodyType?: string;
  plateColour?: string;
  vehicleColor?: string;
  vehicleType?: string;
  vehicleCategory?: string;
  insurance?: string;
  insurancePolicyNo?: string;
  insuranceExpiry?: string;
  regExpiry?: string;
}

interface RopMockApiResponse {
  success: boolean;
  message?: string;
  data?: RopMockApiVehicle;
}

/**
 * Parses a ROP `YYYY-MM-DD` expiry. Returns undefined for anything else, so a
 * blank or malformed value leaves the column null rather than storing an
 * Invalid Date that would read as a real expiry downstream.
 */
function parseRopDate(value: string | undefined): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return undefined;
  const parsed = new Date(`${value.trim()}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

@Injectable()
export class RopApiClientService {
  private static readonly context = 'RopApiClientService';

  /**
   * Attempts per lookup before the plate is given up on. A vehicle is
   * physically at the lane while this runs, so the ceiling is deliberately
   * low — three quick tries ride out a blip, and anything worse is a real
   * outage an operator needs to see rather than wait through.
   */
  private static readonly MAX_FETCH_ATTEMPTS = 3;

  /** Linear backoff between attempts: 400ms, then 800ms. */
  private static pause(attempt: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, attempt * 400));
  }

  constructor(private readonly logger: AppLogger) {}

  /**
   * Fetch vehicle/owner details from ROP by plate.
   * Calls the config-level GET API (Opal provides the real URL — see
   * ROP_API_URL in .env.example; currently points at the local mock server in
   * apis/server.js for development). Returns `null` when unconfigured, or
   * when the plate has no ROP record (404) — the caller then leaves the
   * verification as `Pending` instead of `Fetched`. A network/unexpected
   * error also resolves to `null` (never throws) so callers that don't wrap
   * this in a try/catch (e.g. the walk-in plate-lookup path) degrade
   * gracefully instead of failing the whole request.
   *
   * Transient failures (transport errors, non-404 HTTP failures) are retried up
   * to MAX_FETCH_ATTEMPTS times with a short backoff before giving up. A 404 or
   * a well-formed empty response is a definitive answer from ROP and is never
   * retried.
   */
  async fetchByPlate(plateNumber: string): Promise<RopApiResult | null> {
    const baseUrl = process.env.ROP_API_URL?.trim();
    if (!baseUrl) {
      this.logger.log(
        `ROP API not configured — skipping fetch for plate: ${plateNumber} (status stays Pending)`,
        RopApiClientService.context,
      );
      return null;
    }

    const url = `${baseUrl.replace(/\/$/, '')}?plateNumber=${encodeURIComponent(plateNumber)}`;
    const headers: Record<string, string> = { Accept: 'application/json' };
    const apiKey = process.env.ROP_API_KEY?.trim();
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    for (
      let attempt = 1;
      attempt <= RopApiClientService.MAX_FETCH_ATTEMPTS;
      attempt += 1
    ) {
      const last = attempt === RopApiClientService.MAX_FETCH_ATTEMPTS;
      try {
        const res = await fetch(url, { method: 'GET', headers });

        // A definitive answer from ROP: the vehicle is not on their register.
        // Retrying cannot change it, so return rather than burn attempts.
        if (res.status === 404) {
          this.logger.log(
            `ROP API: no record for plate ${plateNumber}`,
            RopApiClientService.context,
          );
          return null;
        }

        // Anything else non-OK is treated as transient — an overloaded or
        // briefly unavailable ROP is the common case, and the alternative is
        // failing a vehicle that is physically waiting at the lane.
        if (!res.ok) {
          this.logger.warn(
            `ROP API ${res.status} for plate ${plateNumber} (attempt ${attempt}/${RopApiClientService.MAX_FETCH_ATTEMPTS})`,
            RopApiClientService.context,
          );
          if (last) return null;
          await RopApiClientService.pause(attempt);
          continue;
        }

        const body = (await res.json()) as RopMockApiResponse;
        // A well-formed "no data" response is also definitive.
        if (!body?.success || !body.data) {
          return null;
        }

        const raw = body.data;
        return {
          owner_name: raw.ownerName,
          owner_phone: toLocalOmanDigits(raw.ownerPhone),
          driver_name: raw.driverName,
          driver_phone: toLocalOmanDigits(raw.driverPhone),
          mulkiya_id: raw.mulkiyaId,
          vehicle_make: raw.make,
          vehicle_model: raw.model,
          reg_no: raw.plateNumber ?? plateNumber,
          chassis_no: raw.vinNumber,
          insurance: raw.insurance,
          // ROP quotes the expiry as a plain YYYY-MM-DD day, which `new Date`
          // reads as midnight UTC. Left as a date-only value rather than being
          // shifted into Oman time: an expiry is a calendar day, not an instant,
          // and adding a timezone offset would move it across midnight.
          reg_expiry: parseRopDate(raw.regExpiry),
          plate_color: raw.plateColour,
          vehicle_color: raw.vehicleColor,
          vehicle_type: raw.vehicleType,
          raw_response: raw as unknown as Record<string, unknown>,
        };
      } catch (err) {
        this.logger.warn(
          `ROP API lookup failed for ${plateNumber} (attempt ${attempt}/${RopApiClientService.MAX_FETCH_ATTEMPTS}): ${(err as Error).message}`,
          RopApiClientService.context,
        );
        if (last) {
          this.logger.warn(
            `ROP API gave up on plate ${plateNumber} after ${RopApiClientService.MAX_FETCH_ATTEMPTS} attempts`,
            RopApiClientService.context,
          );
          return null;
        }
        await RopApiClientService.pause(attempt);
      }
    }

    return null;
  }

  /**
   * Submit a completed inspection result to ROP. Scaffold — wired to the real
   * ROP submission API once Opal provides it. Returns success for now.
   */
  async submitInspection(
    plateNumber: string,
    result: string,
  ): Promise<{ submitted: boolean }> {
    this.logger.log(
      `ROP stub submit for plate ${plateNumber} → ${result}`,
      RopApiClientService.context,
    );
    return { submitted: true };
  }
}
