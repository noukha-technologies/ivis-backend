import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server } from 'socket.io';
import { getCorsOrigins } from '../../common/config/cors.config';

export type SyncActivityPhase = 'pull' | 'push';
export type SyncActivityStatus = 'started' | 'completed' | 'failed' | 'skipped';

export interface SyncActivityPayload {
  phase: SyncActivityPhase;
  entityKey: string;
  status: SyncActivityStatus;
  message: string;
  count?: number;
}

export interface SyncRunCompletePayload {
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  pushed: Record<string, number>;
  pulled: Record<string, number>;
  error?: string;
}

/**
 * Live progress for the admin UI's Sync Log tab — mirrors AnprGateway's
 * shape exactly (see modules/anpr/services/http-push-service/anpr-gateway.service.ts).
 * Broadcast-only, no incoming client messages. Runs on the centre node
 * (that's where DatabaseSyncService's chunk loop actually executes and the
 * admin is watching from).
 */
@WebSocketGateway({
  namespace: '/sync',
  cors: { origin: getCorsOrigins(), credentials: true },
})
export class SyncGateway {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(SyncGateway.name);

  afterInit() {
    this.logger.log('[WebSocket] Sync Gateway initialized');
  }

  broadcastSyncActivity(payload: SyncActivityPayload): void {
    if (!this.server) return;
    this.server.emit('sync:activity', {
      ...payload,
      timestamp: new Date().toISOString(),
    });
  }

  broadcastSyncRunComplete(payload: SyncRunCompletePayload): void {
    if (!this.server) return;
    this.server.emit('sync:complete', {
      ...payload,
      timestamp: new Date().toISOString(),
    });
  }
}
