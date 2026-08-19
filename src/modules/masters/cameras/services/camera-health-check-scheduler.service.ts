import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { AppLogger } from '../../../../common/logger/app.logger.js';
import { CameraHealthCheckService } from './camera-health-check.service.js';
import { isCentreNode } from '../../../../common/config/env.config.js';

@Injectable()
export class CameraHealthCheckSchedulerService implements OnApplicationBootstrap {
  private static readonly context = 'CameraHealthCheckSchedulerService';

  constructor(
    private readonly healthCheck: CameraHealthCheckService,
    private readonly logger: AppLogger,
  ) {}

  // Runs the first sweep right after the app is up, instead of waiting for
  // the first @Interval(5000) tick to elapse — avoids the misleading silent
  // gap between the Swagger-ready log and the first health-check log line.
  async onApplicationBootstrap(): Promise<void> {
    // Centre-only workload — see isCentreNode(). Central serves the same
    // controllers but owns no cameras, no FTP shares and no provider branch.
    if (!isCentreNode()) return;

    await this.tick();
  }

  @Interval(5000)
  async tick(): Promise<void> {
    // Centre-only workload — see isCentreNode(). Central serves the same
    // controllers but owns no cameras, no FTP shares and no provider branch.
    if (!isCentreNode()) return;

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
