import { Injectable } from '@nestjs/common';
import { AppLogger } from '../../../common/logger/app.logger';

export interface OnlineAppointmentResult {
  plate_number: string;
  customer_name?: string;
  customer_phone?: string;
  id_number?: string;
  chassis_no?: string;
  vehicle_type?: string;
  appointment_at?: string;
}

/**
 * Client for the third-party ONLINE appointment provider (config-level GET API,
 * URL supplied by Opal). On an ANPR capture we look the plate up here: if the
 * provider lists a pre-booked appointment for that plate, the job is created as
 * `Online`; otherwise the caller falls back to `Walk-in`.
 *
 * Config (env): `ONLINE_APPOINTMENT_API_URL` (base), `ONLINE_APPOINTMENT_API_KEY`
 * (optional bearer). When the URL is not configured the lookup returns `null`,
 * so every appointment is treated as Walk-in until the integration is wired.
 *
 * NOTE: the response field mapping below is a PLACEHOLDER — update it once Opal
 * provides the real endpoint and response shape.
 */
@Injectable()
export class OnlineAppointmentApiClientService {
  private static readonly context = 'OnlineAppointmentApiClientService';

  constructor(private readonly logger: AppLogger) {}

  async findByPlate(
    plateNumber: string,
  ): Promise<OnlineAppointmentResult | null> {
    const baseUrl = process.env.ONLINE_APPOINTMENT_API_URL?.trim();
    if (!baseUrl) {
      // Integration not configured yet → no online bookings; caller → Walk-in.
      return null;
    }

    try {
      const url = `${baseUrl.replace(/\/$/, '')}?plate=${encodeURIComponent(plateNumber)}`;
      const headers: Record<string, string> = { Accept: 'application/json' };
      const apiKey = process.env.ONLINE_APPOINTMENT_API_KEY?.trim();
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

      const res = await fetch(url, { method: 'GET', headers });
      if (!res.ok) {
        this.logger.warn(
          `Online appointment API ${res.status} for plate ${plateNumber}`,
          OnlineAppointmentApiClientService.context,
        );
        return null;
      }

      const data = (await res.json()) as unknown;
      const record = (Array.isArray(data) ? data[0] : data) as
        | Record<string, unknown>
        | undefined;
      if (!record) return null;

      // TODO: map the provider's real response shape here once the spec is known.
      return {
        plate_number: plateNumber,
        customer_name: (record.customer_name as string) ?? undefined,
        customer_phone: (record.customer_phone as string) ?? undefined,
        id_number: (record.id_number as string) ?? undefined,
        chassis_no: (record.chassis_no as string) ?? undefined,
        vehicle_type: (record.vehicle_type as string) ?? undefined,
        appointment_at: (record.appointment_at as string) ?? undefined,
      };
    } catch (err) {
      this.logger.warn(
        `Online appointment API lookup failed for ${plateNumber}: ${(err as Error).message}`,
        OnlineAppointmentApiClientService.context,
      );
      return null;
    }
  }
}
