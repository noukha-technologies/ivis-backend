import * as fs from 'fs';
import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { CameraEntity } from '../../../database/entity/camera.entity';
import { CameraIntegrationMethod } from '../../../../common/enums/camera.enums';
import {
  resolveFtpWatchTargets,
  shouldUseMountMode,
  stripCameraPathFromFtpRoot,
} from '../../../../common/utils/ftp-path-resolver.util';
import { AnprMethodConfigService } from '../anpr-method-config.service';
import {
  CameraOfflineError,
  FtpConnectionPoolService,
} from './ftp-connection-pool.service';
import { FtpFileProcessorService } from './ftp-file-processor.service';
import { AnprGateway } from '../http-push-service/anpr-gateway.service';

type WatchMode = 'poll' | 'mount';

type WatcherHandle = {
  cameraId: string;
  cameraCode: string;
  mode: WatchMode;
  interval?: ReturnType<typeof setInterval>;
  fsWatcher?: fs.FSWatcher;
  debounceTimer?: ReturnType<typeof setTimeout>;
  ticking: boolean;
  backoffMs: number;
  watchedPath: string | null;
};

@Injectable()
export class FtpFolderWatcherService implements OnApplicationShutdown {
  private readonly logger = new Logger(FtpFolderWatcherService.name);
  private readonly watchers = new Map<string, WatcherHandle>();
  private readonly watchIntervalMs: number;
  private readonly defaultWatchMode: WatchMode;
  private bootstrapped = false;
  /**
   * Cameras currently being skipped for being offline. Purely so the "waiting"
   * and "resumed" lines are logged once per transition instead of on every
   * tick — the watch interval is ~1s, which would otherwise flood the log.
   */
  private readonly offlineSkipped = new Set<string>();

  constructor(
    private readonly methodConfig: AnprMethodConfigService,
    private readonly fileProcessor: FtpFileProcessorService,
    private readonly ftpPool: FtpConnectionPoolService,
    private readonly anprGateway: AnprGateway,
  ) {
    const ms = parseInt(process.env.ANPR_FTP_WATCH_INTERVAL_MS ?? '1000', 10);
    this.watchIntervalMs = Number.isFinite(ms) && ms >= 500 ? ms : 1000;

    const mode = process.env.ANPR_FTP_WATCH_MODE?.trim().toLowerCase();
    this.defaultWatchMode = mode === 'mount' ? 'mount' : 'poll';
  }

  onApplicationShutdown(): void {
    this.stopAll();
  }

  /**
   * Called once after the application (and database) is fully ready.
   * Validates FTP paths for every active camera, then starts folder listeners.
   */
  async bootstrapOnStartup(): Promise<void> {
    if (this.bootstrapped) {
      return;
    }
    this.bootstrapped = true;

    const cameras = await this.methodConfig.findActiveCamerasWithFtp();
    if (cameras.length === 0) {
      this.logger.log('[FTP Watcher] No active FTP cameras configured');
      return;
    }

    this.logger.log(
      `[FTP Watcher] Checking ${cameras.length} FTP camera(s) and starting listeners...`,
    );

    for (const camera of cameras) {
      this.logCameraPathStatus(camera);
    }

    await this.startAll(cameras);
  }

  async startAll(cameras?: CameraEntity[]): Promise<void> {
    const list =
      cameras ?? (await this.methodConfig.findActiveCamerasWithFtp());
    if (list.length === 0) {
      return;
    }

    await Promise.allSettled(list.map((camera) => this.startWatcher(camera)));
  }

  stopAll(): void {
    for (const cameraId of [...this.watchers.keys()]) {
      this.stopWatcher(cameraId);
    }
  }

  async syncCamera(camera: CameraEntity): Promise<void> {
    this.stopWatcher(camera.id);

    if (!this.shouldWatch(camera)) {
      this.fileProcessor.clearCursor(camera.id);
      return;
    }

    const fresh = await this.methodConfig.findCameraById(camera.id);
    if (!fresh || !this.shouldWatch(fresh)) {
      return;
    }

    this.logCameraPathStatus(fresh);
    await this.startWatcher(fresh);
  }

  async startWatcher(camera: CameraEntity): Promise<void> {
    if (!this.shouldWatch(camera)) {
      return;
    }

    this.stopWatcher(camera.id);

    const mode = this.resolveWatchMode(camera);
    const { ingestPath, listenPath } = resolveFtpWatchTargets(camera);
    const watchPath = mode === 'mount' ? listenPath : ingestPath;

    this.logger.log(
      `[FTP Watcher] Starting ${camera.cameraCode} (${mode}) ingestPath=${ingestPath ?? 'none'} listenPath=${watchPath ?? 'none'}`,
    );

    const handle: WatcherHandle = {
      cameraId: camera.id,
      cameraCode: camera.cameraCode,
      mode,
      ticking: false,
      backoffMs: 0,
      watchedPath: watchPath,
    };
    this.watchers.set(camera.id, handle);

    await this.runCycle(camera.id).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `[FTP Watcher] Initial backlog scan failed for ${camera.cameraCode}: ${msg}`,
      );
    });

    if (mode === 'mount') {
      this.startMountWatch(camera, handle);
    } else {
      handle.interval = setInterval(() => {
        void this.runCycle(camera.id);
      }, this.watchIntervalMs);
    }
  }

  stopWatcher(cameraId: string): void {
    const handle = this.watchers.get(cameraId);
    if (!handle) {
      return;
    }

    if (handle.interval) {
      clearInterval(handle.interval);
    }
    if (handle.debounceTimer) {
      clearTimeout(handle.debounceTimer);
    }
    if (handle.fsWatcher) {
      handle.fsWatcher.close();
    }

    this.watchers.delete(cameraId);
    this.offlineSkipped.delete(cameraId);
    this.ftpPool.releaseConnection(cameraId);

    this.logger.log(
      `[FTP Watcher] Stopped ${handle.cameraCode} (id=${cameraId})`,
    );
  }

  async scanNow(cameraId: string): Promise<void> {
    const camera = await this.methodConfig.findCameraById(cameraId);
    if (!camera) {
      throw new Error(`Camera not found: ${cameraId}`);
    }
    await this.runCycle(camera.id);
  }

  private logCameraPathStatus(camera: CameraEntity): void {
    const ftpRoot = stripCameraPathFromFtpRoot(
      camera.ftpDirectory ?? '',
      camera.centreCode ?? '',
      camera.ipAddress,
    );
    const { ingestPath, listenPath, cameraFolder } =
      resolveFtpWatchTargets(camera);

    const rootOk = this.pathReadable(ftpRoot);
    const cameraFolderOk = cameraFolder
      ? this.pathReadable(cameraFolder)
      : false;
    const ingestOk = ingestPath ? this.pathReadable(ingestPath) : false;

    this.logger.log(
      `[FTP Watcher] ${camera.cameraCode}: root=${ftpRoot} (${rootOk ? 'OK' : 'MISSING'})`,
    );
    if (cameraFolder) {
      this.logger.log(
        `[FTP Watcher] ${camera.cameraCode}: cameraFolder=${cameraFolder} (${cameraFolderOk ? 'OK' : 'MISSING'})`,
      );
    }
    if (ingestPath) {
      this.logger.log(
        `[FTP Watcher] ${camera.cameraCode}: ingestPath=${ingestPath} (${ingestOk ? 'OK' : 'pending — date folder not created yet'})`,
      );
    }
    if (listenPath && listenPath !== ingestPath) {
      this.logger.log(
        `[FTP Watcher] ${camera.cameraCode}: listenPath=${listenPath} (watching parent until date folder appears)`,
      );
    }
    if (!rootOk) {
      this.logger.warn(
        `[FTP Watcher] ${camera.cameraCode}: cannot ingest until FTP root exists on this host`,
      );
    }
  }

  private pathReadable(target: string): boolean {
    try {
      fs.accessSync(target, fs.constants.R_OK);
      return fs.statSync(target).isDirectory();
    } catch {
      return false;
    }
  }

  private shouldWatch(camera: CameraEntity): boolean {
    return (
      camera.isActive &&
      camera.integrationMethod === CameraIntegrationMethod.FTP &&
      Boolean(camera.ftpDirectory?.trim())
    );
  }

  private resolveWatchMode(camera: CameraEntity): WatchMode {
    if (shouldUseMountMode(camera)) {
      return 'mount';
    }
    return this.defaultWatchMode;
  }

  private resolveMountListenPath(camera: CameraEntity): string | null {
    const { listenPath } = resolveFtpWatchTargets(camera);
    return listenPath;
  }

  private startMountWatch(camera: CameraEntity, handle: WatcherHandle): void {
    const dir = this.resolveMountListenPath(camera);
    if (!dir) {
      this.logger.error(`[FTP Watcher] No watch path for ${camera.cameraCode}`);
      return;
    }

    if (!this.pathReadable(dir)) {
      this.logger.warn(
        `[FTP Watcher] Listen path not ready for ${camera.cameraCode}: ${dir} — polling every ${this.watchIntervalMs}ms until it appears`,
      );
      if (!handle.interval) {
        handle.interval = setInterval(() => {
          void this.runCycle(camera.id);
          const next = this.resolveMountListenPath(camera);
          if (next && this.pathReadable(next) && next !== handle.watchedPath) {
            if (handle.interval) {
              clearInterval(handle.interval);
              handle.interval = undefined;
            }
            handle.watchedPath = next;
            this.startMountWatch(camera, handle);
          }
        }, this.watchIntervalMs);
      }
      return;
    }

    handle.watchedPath = dir;

    try {
      const recursive =
        process.platform === 'win32' || process.platform === 'darwin';
      handle.fsWatcher = fs.watch(
        dir,
        recursive ? { recursive: true } : undefined,
        () => {
          if (handle.debounceTimer) {
            clearTimeout(handle.debounceTimer);
          }
          handle.debounceTimer = setTimeout(() => {
            void this.runCycle(camera.id);
          }, 300);
        },
      );

      handle.fsWatcher.on('error', (err) => {
        this.logger.error(
          `[FTP Watcher] fs.watch error ${camera.cameraCode}: ${err.message}`,
        );
        this.anprGateway.broadcastFtpActivity({
          cameraCode: camera.cameraCode,
          type: 'scan_error',
          message: err.message,
        });
      });

      this.logger.log(
        `[FTP Watcher] Listening on ${dir} for ${camera.cameraCode}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `[FTP Watcher] Cannot watch ${dir} for ${camera.cameraCode}: ${msg}`,
      );
    }
  }

  private async runCycle(cameraId: string): Promise<void> {
    const handle = this.watchers.get(cameraId);
    if (!handle) {
      return;
    }

    if (handle.ticking) {
      return;
    }

    if (handle.backoffMs > 0) {
      await new Promise((r) => setTimeout(r, handle.backoffMs));
    }

    handle.ticking = true;

    try {
      const camera = await this.methodConfig.findCameraById(cameraId);
      if (!camera || !this.shouldWatch(camera)) {
        this.stopWatcher(cameraId);
        return;
      }

      // Offline cameras are skipped, not stopped: the watcher stays registered
      // and idles cheaply, so when the health checker marks the camera online
      // again the next tick resumes on its own. Re-read fresh above, so this
      // reflects the latest health check rather than boot-time state.
      if (!camera.isOnline) {
        if (!this.offlineSkipped.has(cameraId)) {
          this.offlineSkipped.add(cameraId);
          this.logger.warn(
            `[FTP Watcher] ${camera.cameraCode} is offline — pausing scans until the health check clears it`,
          );
        }
        return;
      }

      if (this.offlineSkipped.delete(cameraId)) {
        this.logger.log(
          `[FTP Watcher] ${camera.cameraCode} is back online — resuming scans`,
        );
      }

      const mode = this.resolveWatchMode(camera);
      handle.mode = mode;

      const { listenPath } = resolveFtpWatchTargets(camera);
      if (
        mode === 'mount' &&
        listenPath &&
        listenPath !== handle.watchedPath &&
        this.pathReadable(listenPath)
      ) {
        if (handle.fsWatcher) {
          handle.fsWatcher.close();
          handle.fsWatcher = undefined;
        }
        if (handle.interval) {
          clearInterval(handle.interval);
          handle.interval = undefined;
        }
        handle.watchedPath = listenPath;
        this.startMountWatch(camera, handle);
      }

      const result =
        mode === 'mount'
          ? await this.fileProcessor.processNewFilesOnMount(camera)
          : await this.fileProcessor.processNewFilesOnFtp(camera);

      handle.backoffMs = 0;

      if (result.filesFound > 0) {
        this.logger.log(
          `[FTP Watcher] ${camera.cameraCode}: ${result.parsed}/${result.filesFound} parsed, ${result.saved} saved`,
        );
      }
    } catch (err: unknown) {
      // The camera went offline between the health read above and the connect.
      // Nothing was attempted, so there is no transport problem to back off
      // from — idle and let the next tick take the offline path properly.
      if (err instanceof CameraOfflineError) {
        return;
      }

      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `[FTP Watcher] Cycle failed for camera id=${cameraId}: ${message}`,
      );

      handle.backoffMs = Math.min(
        handle.backoffMs > 0 ? handle.backoffMs * 2 : 1000,
        30_000,
      );

      this.ftpPool.releaseConnection(cameraId);

      const camera = await this.methodConfig.findCameraById(cameraId);
      if (camera) {
        this.anprGateway.broadcastFtpActivity({
          cameraCode: camera.cameraCode,
          type: 'scan_error',
          message,
        });
      }
    } finally {
      handle.ticking = false;
    }
  }
}
