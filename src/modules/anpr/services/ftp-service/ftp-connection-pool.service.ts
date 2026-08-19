import Client from 'ftp';
import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';

import { CameraEntity } from '../../../database/entity/camera.entity';
import { CameraIntegrationMethod } from '../../../../common/enums/camera.enums';

type PooledFtp = {
  client: Client;
  camera: CameraEntity;
  isConnected: boolean;
};

/**
 * Thrown instead of dialling a camera the health checker has marked offline.
 *
 * A distinct type so callers can treat it as "skip this camera for now" rather
 * than a transport failure worth backing off or alerting on — nothing was
 * attempted, so there is nothing to retry differently.
 */
export class CameraOfflineError extends Error {
  constructor(cameraCode: string) {
    super(`Camera ${cameraCode} is offline — FTP not attempted`);
    this.name = 'CameraOfflineError';
  }
}

/**
 * One FTP control connection per camera. Used to LIST and GET files on the camera/server.
 */
@Injectable()
export class FtpConnectionPoolService implements OnApplicationShutdown {
  private readonly logger = new Logger(FtpConnectionPoolService.name);
  private readonly connections = new Map<string, PooledFtp>();

  onApplicationShutdown(): void {
    this.closeAll();
  }

  private ftpControlPort(camera: CameraEntity): number {
    // Entity default port is 80 (HTTP). For FTP cameras that were never switched off 80, use standard FTP control port 21.
    if (
      camera.integrationMethod === CameraIntegrationMethod.FTP &&
      camera.port === 80
    ) {
      return 21;
    }
    return camera.port || 21;
  }

  async getConnection(camera: CameraEntity): Promise<Client> {
    // Never dial a camera the health checker cannot reach. Every connect
    // against an unreachable host costs a full socket timeout, and the callers
    // run on intervals — so an offline camera produced a steady stream of
    // timeout errors that buried the real logs and kept sockets in flight for
    // nothing. The health check re-tests it on its own schedule; when it comes
    // back this gate simply stops firing, so no restart is needed.
    if (!camera.isOnline) {
      throw new CameraOfflineError(camera.cameraCode);
    }

    const existing = this.connections.get(camera.id);
    if (existing?.isConnected) {
      return existing.client;
    }
    if (existing && !existing.isConnected) {
      this.connections.delete(camera.id);
    }

    const client = new Client();

    return new Promise((resolve, reject) => {
      client.once('ready', () => {
        this.logger.log(
          `FTP connected: ${camera.cameraCode} @ ${camera.ipAddress}:${this.ftpControlPort(camera)}`,
        );
        this.connections.set(camera.id, {
          client,
          camera,
          isConnected: true,
        });
        resolve(client);
      });

      client.once('error', (err: Error) => {
        this.logger.error(`FTP error for ${camera.cameraCode}: ${err.message}`);
        this.closeConnection(camera.id);
        reject(err);
      });

      client.on('close', () => {
        const conn = this.connections.get(camera.id);
        if (conn) {
          conn.isConnected = false;
        }
        this.logger.warn(`FTP connection closed: ${camera.cameraCode}`);
      });

      client.connect({
        host: camera.ipAddress,
        port: this.ftpControlPort(camera),
        user: camera.username,
        password: camera.password,
        connTimeout: 15000,
        pasvTimeout: 15000,
      });
    });
  }

  closeConnection(cameraId: string): void {
    const conn = this.connections.get(cameraId);
    if (conn?.isConnected) {
      try {
        conn.client.end();
      } catch {
        /* ignore */
      }
      conn.isConnected = false;
      this.logger.log(`FTP client ended for camera id=${cameraId}`);
    }
  }

  closeAll(): void {
    for (const [, conn] of this.connections) {
      if (conn.isConnected) {
        try {
          conn.client.end();
        } catch {
          /* ignore */
        }
        conn.isConnected = false;
      }
    }
    this.connections.clear();
    this.logger.log('All FTP connections closed');
  }

  async listFiles(
    camera: CameraEntity,
    remotePath: string,
  ): Promise<Client.ListingElement[]> {
    const client = await this.getConnection(camera);
    return new Promise((resolve, reject) => {
      client.list(remotePath, (err, list) => {
        if (err) {
          this.logger.error(
            `FTP list failed ${remotePath} on ${camera.cameraCode}: ${err.message}`,
          );
          reject(err);
        } else {
          resolve(list ?? []);
        }
      });
    });
  }

  async downloadFile(
    camera: CameraEntity,
    remoteFile: string,
  ): Promise<Buffer> {
    const client = await this.getConnection(camera);
    return new Promise((resolve, reject) => {
      client.get(remoteFile, (err, stream) => {
        if (err || !stream) {
          reject(err ?? new Error('FTP get: no stream'));
          return;
        }
        const chunks: Buffer[] = [];
        stream.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });
        stream.once('end', () => {
          resolve(Buffer.concat(chunks));
        });
        stream.once('error', reject);
      });
    });
  }

  async deleteFile(camera: CameraEntity, remoteFile: string): Promise<void> {
    const client = await this.getConnection(camera);
    return new Promise((resolve, reject) => {
      client.delete(remoteFile, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async renameFile(
    camera: CameraEntity,
    fromPath: string,
    toPath: string,
  ): Promise<void> {
    const client = await this.getConnection(camera);
    return new Promise((resolve, reject) => {
      client.rename(fromPath, toPath, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /** Create remote directory if missing (recursive). Ignores "already exists" errors. */
  async ensureDirectory(
    camera: CameraEntity,
    remotePath: string,
  ): Promise<void> {
    const client = await this.getConnection(camera);
    return new Promise((resolve, reject) => {
      client.mkdir(remotePath, true, (err) => {
        if (err && !/exists|file exists/i.test(err.message)) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /** Close and remove pooled connection for a camera (frees FTP slot between scan cycles). */
  releaseConnection(cameraId: string): void {
    this.closeConnection(cameraId);
    this.connections.delete(cameraId);
  }
}
