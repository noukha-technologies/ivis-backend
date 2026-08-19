import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { shouldUseMountMode } from '../../../../common/utils/ftp-path-resolver.util';

import { AnprMethodConfigService } from '../anpr-method-config.service';
import { FtpFileProcessorService } from './ftp-file-processor.service';
import { FtpFolderWatcherService } from './ftp-folder-watcher.service';
@Injectable()
export class FtpDirectoryScannerService implements OnModuleInit {
  private readonly fallbackSweepMs: number;
  private readonly logger = new Logger(FtpDirectoryScannerService.name);

  constructor(
    private readonly methodConfig: AnprMethodConfigService,
    private readonly fileProcessor: FtpFileProcessorService,
    private readonly folderWatcher: FtpFolderWatcherService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {
    const minutes = parseInt(
      process.env.ANPR_FTP_FALLBACK_SWEEP_MINUTES ?? '5',
      10,
    );
    this.fallbackSweepMs =
      Number.isFinite(minutes) && minutes > 0 ? minutes * 60_000 : 0;
  }

  onModuleInit(): void {
    if (this.fallbackSweepMs <= 0) {
      this.logger.log(
        '[FTP Fallback] Disabled (ANPR_FTP_FALLBACK_SWEEP_MINUTES=0)',
      );
      return;
    }

    const interval = setInterval(() => {
      void this.fallbackSweep();
    }, this.fallbackSweepMs);
    this.schedulerRegistry.addInterval('ftp-fallback-sweep', interval);

    this.logger.log(
      `[FTP Fallback] Safety sweep every ${this.fallbackSweepMs / 60_000} min`,
    );
  }

  async manualScan(cameraId: string): Promise<void> {
    const camera = await this.methodConfig.findCameraById(cameraId);
    if (!camera) {
      throw new NotFoundException(`Camera not found: ${cameraId}`);
    }
    if (!this.methodConfig.isMethodEnabled(camera, 'FTP')) {
      throw new BadRequestException(
        `Camera ${cameraId} is not configured for FTP integration`,
      );
    }
    if (!camera.ftpDirectory?.trim()) {
      throw new BadRequestException(
        `Camera ${cameraId} has no ftpDirectory configured`,
      );
    }
    // Refuse up front rather than letting the operator wait out a socket
    // timeout and then read a generic transport error.
    if (!camera.isOnline) {
      throw new BadRequestException(
        `Camera ${camera.cameraCode} is offline (${camera.health_status}). Bring it online before scanning.`,
      );
    }

    await this.folderWatcher.scanNow(cameraId);
  }

  private async fallbackSweep(): Promise<void> {
    const configured = await this.methodConfig.findActiveCamerasWithFtp();
    if (configured.length === 0) {
      return;
    }

    // Offline cameras are dropped before the sweep rather than failing inside
    // it: each attempt against an unreachable host costs a socket timeout, and
    // reporting that as a "sweep failure" per camera per cycle is noise, not
    // information. The health checker owns deciding when they are back.
    const cameras = configured.filter((c) => c.isOnline);
    const skipped = configured.length - cameras.length;

    if (cameras.length === 0) {
      this.logger.debug(
        `[FTP Fallback] Skipped — all ${skipped} FTP camera(s) offline`,
      );
      return;
    }

    this.logger.debug(
      `[FTP Fallback] Sweeping ${cameras.length} camera(s)` +
        (skipped > 0 ? ` (${skipped} offline, skipped)` : ''),
    );

    await Promise.allSettled(
      cameras.map(async (camera) => {
        try {
          if (shouldUseMountMode(camera)) {
            await this.fileProcessor.processNewFilesOnMount(camera);
          } else {
            await this.fileProcessor.processNewFilesOnFtp(camera);
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            `[FTP Fallback] Sweep failed for ${camera.cameraCode}: ${msg}`,
          );
        }
      }),
    );
  }
}
