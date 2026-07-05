import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { getCorsOrigins } from '../../../../common/config/cors.config';

/**
 * ═══════════════════════════════════════════════════════════════════
 * ANPR WEBSOCKET GATEWAY
 * ═══════════════════════════════════════════════════════════════════
 *
 * Real-time event broadcast to connected clients (dashboard/inspectors)
 *
 * Events:
 * - anpr:event - New plate detected (full details)
 * - anpr:plate - Minimal plate notification
 * - stats:update - Camera health/stats
 *
 * Clients:
 * - Inspector Dashboard (watches incoming plates)
 * - Admin Dashboard (monitors cameras)
 * - Mobile Apps (real-time alerts)
 */
@WebSocketGateway({
  namespace: '/anpr',
  cors: {
    origin: getCorsOrigins(),
    credentials: true,
  },
})
export class AnprGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(AnprGateway.name);
  private connectedClients = new Map<string, Socket>();

  /**
   * Initialize gateway
   */
  afterInit() {
    this.logger.log('[WebSocket] ANPR Gateway initialized');
  }

  /**
   * Handle client connection
   *
   * @param client - Connected socket
   */
  handleConnection(client: Socket) {
    this.connectedClients.set(client.id, client);

    this.logger.log(
      `[WebSocket] Client connected: ${client.id} (total: ${this.connectedClients.size})`,
    );

    // Send welcome message
    client.emit('connected', {
      message: 'Connected to ANPR stream',
      clientId: client.id,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Handle client disconnect
   *
   * @param client - Disconnected socket
   */
  handleDisconnect(client: Socket) {
    this.connectedClients.delete(client.id);

    this.logger.log(
      `[WebSocket] Client disconnected: ${client.id} (total: ${this.connectedClients.size})`,
    );
  }

  /**
   * Broadcast new ANPR event to all connected clients
   *
   * @param eventPayload - Event data to broadcast
   */
  broadcastAnprEvent(eventPayload: any): void {
    if (!this.server) {
      this.logger.warn('[WebSocket] Server not ready, skipping broadcast');
      return;
    }

    this.server.emit('anpr:event', {
      type: 'plate_detected',
      data: eventPayload,
      timestamp: new Date().toISOString(),
    });

    this.logger.debug(`[WebSocket] Broadcasted event: ${eventPayload.plate}`);
  }

  /**
   * Broadcast camera health update
   *
   * @param cameraCode - Camera identifier
   * @param status - Online/offline status
   * @param lastSeen - Last activity timestamp
   */
  broadcastCameraStatus(
    cameraCode: string,
    status: 'online' | 'offline',
    lastSeen: Date,
  ): void {
    if (!this.server) return;

    this.server.emit('camera:status', {
      cameraCode,
      status,
      lastSeen: lastSeen.toISOString(),
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Broadcast statistics update
   *
   * @param stats - Statistics object
   */
  broadcastStats(stats: any): void {
    if (!this.server) return;

    this.server.emit('stats:update', {
      data: stats,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Broadcast FTP directory scan activity for Live Console.
   */
  broadcastFtpActivity(payload: {
    cameraCode: string;
    type:
      | 'scan_start'
      | 'scan_complete'
      | 'file_found'
      | 'file_parsed'
      | 'file_saved'
      | 'file_skipped'
      | 'file_error'
      | 'scan_error';
    message: string;
    fileName?: string;
    plateNumber?: string;
    xmlCount?: number;
    savedCount?: number;
  }): void {
    if (!this.server) return;

    this.server.emit('ftp:activity', {
      ...payload,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Send message to specific client
   *
   * @param clientId - Target client ID
   * @param event - Event name
   * @param data - Event data
   */
  sendToClient(clientId: string, event: string, data: any): void {
    const client = this.connectedClients.get(clientId);

    if (!client) {
      this.logger.warn(`[WebSocket] Client not found: ${clientId}`);
      return;
    }

    client.emit(event, data);
  }

  /**
   * Get connected clients count
   *
   * @returns Number of connected clients
   */
  getConnectedCount(): number {
    return this.connectedClients.size;
  }
}
