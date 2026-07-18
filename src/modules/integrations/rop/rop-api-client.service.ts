import { Injectable } from '@nestjs/common';
import { AppLogger } from '../../../common/logger/app.logger';

export interface RopApiResult {
  owner_name?: string;
  owner_phone?: string;
  vehicle_make?: string;
  vehicle_model?: string;
  reg_no?: string;
  chassis_no?: string;
  insurance?: string;
  reg_expiry?: Date;
  /** The full, unmodified API response — kept as proof of the lookup. */
  raw_response?: Record<string, unknown>;
}

@Injectable()
export class RopApiClientService {
  private static readonly context = 'RopApiClientService';

  constructor(private readonly logger: AppLogger) {}

  /**
   * Fetch vehicle/owner details from ROP by plate.
   * Returns `null` when no real ROP API is configured yet (the current state) —
   * the caller then leaves the verification as `Pending` instead of `Fetched`.
   * Wire the real Opal ROP API here; a thrown error is treated as `Failed`.
   */
  async fetchByPlate(plateNumber: string): Promise<RopApiResult | null> {
    this.logger.log(
      `ROP API not configured — skipping fetch for plate: ${plateNumber} (status stays Pending)`,
      RopApiClientService.context,
    );
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
