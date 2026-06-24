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
}

@Injectable()
export class RopApiClientService {
  private static readonly context = 'RopApiClientService';

  constructor(private readonly logger: AppLogger) {}

  async fetchByPlate(plateNumber: string): Promise<RopApiResult> {
    this.logger.log(`ROP stub fetch for plate: ${plateNumber}`, RopApiClientService.context);
    return {
      owner_name: `Owner — ${plateNumber}`,
      owner_phone: undefined,
      vehicle_make: undefined,
      vehicle_model: undefined,
      reg_no: plateNumber,
      chassis_no: undefined,
      insurance: undefined,
      reg_expiry: undefined,
    };
  }
}
