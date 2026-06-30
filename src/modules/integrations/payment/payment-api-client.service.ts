import { Injectable } from '@nestjs/common';
import { AppLogger } from '../../../common/logger/app.logger';

export interface PaymentApiResult {
  /** Already-collected advance amount (OMR, inc VAT). */
  advance: number;
  paid: boolean;
}

/**
 * Client for the third-party payment provider (config-level GET API supplied by
 * Opal). Used at the job Invoice/Payment stage to fetch any advance already paid
 * for a plate/job. Returns `null` when `PAYMENT_API_URL` is unconfigured, so the
 * caller treats the advance as 0 until the integration is wired.
 *
 * NOTE: the response field mapping is a PLACEHOLDER — update it once Opal
 * provides the real endpoint and response shape.
 */
@Injectable()
export class PaymentApiClientService {
  private static readonly context = 'PaymentApiClientService';

  constructor(private readonly logger: AppLogger) {}

  async fetchByPlate(plateNumber: string): Promise<PaymentApiResult | null> {
    const baseUrl = process.env.PAYMENT_API_URL?.trim();
    if (!baseUrl) return null;

    try {
      const url = `${baseUrl.replace(/\/$/, '')}?plate=${encodeURIComponent(plateNumber)}`;
      const headers: Record<string, string> = { Accept: 'application/json' };
      const apiKey = process.env.PAYMENT_API_KEY?.trim();
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

      const res = await fetch(url, { method: 'GET', headers });
      if (!res.ok) {
        this.logger.warn(
          `Payment API ${res.status} for plate ${plateNumber}`,
          PaymentApiClientService.context,
        );
        return null;
      }

      const data = (await res.json()) as Record<string, unknown> | null;
      if (!data) return null;

      // TODO: map the provider's real response shape here once the spec is known.
      return {
        advance: Number(data.advance ?? 0) || 0,
        paid: Boolean(data.paid),
      };
    } catch (err) {
      this.logger.warn(
        `Payment API lookup failed for ${plateNumber}: ${(err as Error).message}`,
        PaymentApiClientService.context,
      );
      return null;
    }
  }
}
