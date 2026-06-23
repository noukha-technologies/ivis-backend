import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { AppLogger } from '../../../../common/logger/app.logger.js';
import { CameraHealthCheckService } from './camera-health-check.service.js';

@Injectable()
export class CameraHealthCheckSchedulerService {
  private static readonly context = 'CameraHealthCheckSchedulerService';

  constructor(
    private readonly healthCheck: CameraHealthCheckService,
    private readonly logger: AppLogger,
  ) {}

  @Interval(5000)
  async tick(): Promise<void> {
    try {
      await this.healthCheck.runDueHealthChecks();
    } catch (error) {
      this.logger.error(
        `Health check tick failed: ${(error as Error).message}`,
        (error as Error).stack,
        CameraHealthCheckSchedulerService.context,
      );
    }
  }
}
