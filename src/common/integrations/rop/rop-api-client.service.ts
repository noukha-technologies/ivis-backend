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
}

interface RopMockApiResponse {
  success: boolean;
  message?: string;
  data?: RopMockApiVehicle;
}

@Injectable()
export class RopApiClientService {
  private static readonly context = 'RopApiClientService';

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

    try {
      const url = `${baseUrl.replace(/\/$/, '')}?plateNumber=${encodeURIComponent(plateNumber)}`;
      const headers: Record<string, string> = { Accept: 'application/json' };
      const apiKey = process.env.ROP_API_KEY?.trim();
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

      const res = await fetch(url, { method: 'GET', headers });
      if (res.status === 404) {
        this.logger.log(
          `ROP API: no record for plate ${plateNumber}`,
          RopApiClientService.context,
        );
        return null;
      }
      if (!res.ok) {
        this.logger.warn(
          `ROP API ${res.status} for plate ${plateNumber}`,
          RopApiClientService.context,
        );
        return null;
      }

      const body = (await res.json()) as RopMockApiResponse;
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
        plate_color: raw.plateColour,
        vehicle_color: raw.vehicleColor,
        vehicle_type: raw.vehicleType,
        raw_response: raw as unknown as Record<string, unknown>,
      };
    } catch (err) {
      this.logger.warn(
        `ROP API lookup failed for ${plateNumber}: ${(err as Error).message}`,
        RopApiClientService.context,
      );
      return null;
    }
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
