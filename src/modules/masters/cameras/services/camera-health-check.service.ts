import ping from 'ping';
import { Injectable } from '@nestjs/common';
import { CameraDao } from '../../../database/dao/camera.dao.js';
import { Camera } from '../../../database/entity/camera.entity.js';
import { AppLogger } from '../../../../common/logger/app.logger.js';
import { FullHealthCheckResult } from '../../../../common/enums/common.enums.js';

@Injectable()
export class CameraHealthCheckService {
  private static readonly context = 'CameraHealthCheckService';

  constructor(
    private readonly cameraDao: CameraDao,
    private readonly logger: AppLogger,
  ) { }

  async pingCamera(ip: string): Promise<boolean> {
    try {
      const res = await ping.promise.probe(ip, { timeout: 2 });
      return res.alive;
    } catch (error) {
      this.logger.log(`Ping failed for ${ip}: ${error}`, CameraHealthCheckService.context);
      return false;
    }
  }

  private updateCameraStatus(camera: Camera, isReachable: boolean): void {
    if (isReachable) {
      camera.health_status = 'ONLINE';
      camera.is_online = true;
    } else {
      camera.health_status =
        camera.health_status === 'ONLINE' || camera.health_status === 'OFFLINE'
          ? 'OFFLINE'
          : 'NOT_REACHABLE';
      camera.is_online = false;
    }
  }

  async persistHealthFromPingResult(
    camera: Camera,
    pingOk: boolean,
  ): Promise<FullHealthCheckResult> {
    const now = new Date();
    this.updateCameraStatus(camera, pingOk);
    camera.last_health_check = now;
    if (pingOk) {
      camera.last_seen_at = now;
    }
    await this.cameraDao.save(camera);
    return this.buildHealthPayload(camera, pingOk);
  }

  private buildHealthPayload(camera: Camera, pingOk: boolean): FullHealthCheckResult {
    return {
      camera: {
        id: camera.id,
        code: camera.code,
        camera_name: camera.camera_name,
        ip_address: camera.ip_address,
      },
      healthStatus: camera.health_status,
      lastCheck: camera.last_health_check ?? null,
      checks: {
        ping: {
          status: pingOk ? 'PASS' : 'FAIL',
          message: pingOk
            ? 'Camera IP is reachable'
            : 'Camera IP is unreachable (offline or network)',
        },
      },
    };
  }

  async performFullHealthCheck(cameraId: string): Promise<FullHealthCheckResult | null> {
    const camera = await this.cameraDao.findActiveById(cameraId);
    if (!camera) {
      return null;
    }
    const pingOk = await this.pingCamera(camera.ip_address);
    return this.persistHealthFromPingResult(camera, pingOk);
  }

  async findCameraByCode(code: string): Promise<Camera | null> {
    return this.cameraDao.findByCode(code);
  }

  async runDueHealthChecks(): Promise<void> {
    const cameras = await this.cameraDao.find({
      where: { status: 'Active', is_deleted: false },
    });
    const now = Date.now();

    for (const cam of cameras) {
      try {
        const camera = await this.cameraDao.findOne({
          where: { id: cam.id, is_deleted: false },
        });
        if (!camera || camera.status !== 'Active') continue;

        const intervalMs = Math.max(10, camera.health_ping_interval_seconds ?? 30) * 1000;
        const lastCheck = camera.last_health_check?.getTime() ?? 0;

        if (now - lastCheck >= intervalMs) {
          await this.pingCheck(camera);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `[Health Check] Failed for camera id ${cam.id}: ${message}`,
          undefined,
          CameraHealthCheckService.context,
        );
      }
    }
  }

  private async pingCheck(camera: Camera): Promise<void> {
    const isAlive = await this.pingCamera(camera.ip_address);
    await this.persistHealthFromPingResult(camera, isAlive);
  }

  async runAllChecksNow(): Promise<void> {
    const cameras = await this.cameraDao.find({
      where: { status: 'Active', is_deleted: false },
    });
    for (const c of cameras) {
      await this.performFullHealthCheck(c.id);
    }
  }

  async getHealthSummaryForAll(): Promise<{
    totalCameras: number;
    healthy: number;
    degraded: number;
    offline: number;
    unknown: number;
    cameras: Array<{
      id: string;
      code: string;
      camera_name: string;
      ip_address: string;
      healthStatus: string;
      lastHealthCheck: Date | null;
      lastEventAt: Date | null;
      isOnline: boolean;
    }>;
  }> {
    const cameras = await this.cameraDao.find({
      where: { is_deleted: false },
      order: { camera_id: 'ASC' },
    });

    const summary = {
      totalCameras: cameras.length,
      healthy: 0,
      degraded: 0,
      offline: 0,
      unknown: 0,
      cameras: cameras.map((c) => ({
        id: c.id,
        code: c.code,
        camera_name: c.camera_name,
        ip_address: c.ip_address,
        healthStatus: c.health_status,
        lastHealthCheck: c.last_health_check ?? null,
        lastEventAt: c.last_event_at ?? null,
        isOnline: c.is_online,
      })),
    };

    for (const row of summary.cameras) {
      if (row.healthStatus === 'ONLINE') summary.healthy++;
      else if (row.healthStatus === 'OFFLINE') summary.offline++;
      else summary.unknown++;
    }

    return summary;
  }

  getHealthRecommendation(healthStatus: string): string {
    if (healthStatus === 'ONLINE') return 'Camera is operating normally. No action required.';
    if (healthStatus === 'OFFLINE') return 'Camera is OFFLINE. Check power and network; verify IP.';
    if (healthStatus === 'NOT_REACHABLE') return 'Camera is NOT REACHABLE. Check initial network configuration.';
    return 'Health status unknown or disconnected. Run a health check.';
  }

  async getHealthHistorySnapshot(cameraId: string): Promise<{
    camera: { id: string; code: string; camera_name: string };
    currentStatus: Record<string, unknown>;
    history: unknown[];
    recommendation: string;
  } | null> {
    const camera = await this.cameraDao.findActiveById(cameraId);
    if (!camera) return null;

    return {
      camera: {
        id: camera.id,
        code: camera.code,
        camera_name: camera.camera_name,
      },
      currentStatus: {
        healthStatus: camera.health_status,
        isOnline: camera.is_online,
        lastHealthCheck: camera.last_health_check ?? null,
        lastSeenAt: camera.last_seen_at ?? null,
        lastEventAt: camera.last_event_at ?? null,
        healthPingIntervalSeconds: camera.health_ping_interval_seconds,
      },
      history: [],
      recommendation: this.getHealthRecommendation(camera.health_status),
    };
  }
}
