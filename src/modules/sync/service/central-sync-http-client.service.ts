import { Injectable } from '@nestjs/common';
import { AppLogger } from '../../../common/logger/app.logger';

export interface SyncPushChunkResult {
  accepted: number;
  hasMore: boolean;
  nextChunkIndex: number;
}

export interface SyncPullChunkResult {
  rows: Record<string, unknown>[];
  hasMore: boolean;
  nextCursor: string | null;
}

/**
 * Centre-side HTTP client for Database Sync's central endpoints — see
 * Database_sync_arch_replan.md §3/§3a/§7. Plain fetch, env-driven base URL +
 * API key, modeled on payment-api-client.service.ts's confirmed pattern. As
 * with the onboarding client, sync failures must surface clearly (not
 * silently degrade) so DatabaseSyncService can record an accurate PARTIAL/
 * FAILED run outcome per entity.
 */
@Injectable()
export class CentralSyncHttpClientService {
  private static readonly context = 'CentralSyncHttpClientService';

  constructor(private readonly logger: AppLogger) {}

  private baseUrl(): string {
    const url = process.env.CENTRAL_SYNC_API_URL?.trim();
    if (!url) {
      throw new Error('CENTRAL_SYNC_API_URL is not configured');
    }
    return url.replace(/\/$/, '');
  }

  private apiKey(): string {
    const key = process.env.CENTRAL_SYNC_API_KEY?.trim();
    if (!key) {
      throw new Error('CENTRAL_SYNC_API_KEY is not configured');
    }
    return key;
  }

  async startRun(): Promise<{ runId: string }> {
    return this.post('/sync/run/start', {});
  }

  async pushChunk(
    runId: string,
    entityKey: string,
    chunkIndex: number,
    rows: Record<string, unknown>[],
  ): Promise<SyncPushChunkResult> {
    return this.post('/sync/run/push', { runId, entityKey, chunkIndex, rows });
  }

  async pullChunk(
    runId: string,
    entityKey: string,
    cursor?: string,
  ): Promise<SyncPullChunkResult> {
    return this.post('/sync/run/pull', { runId, entityKey, cursor });
  }

  async finishRun(
    runId: string,
    status: 'SUCCESS' | 'PARTIAL' | 'FAILED',
    error?: string,
  ): Promise<void> {
    await this.post('/sync/run/finish', { runId, status, error });
  }

  private async post<T>(
    path: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl()}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${this.apiKey()}`,
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      const message = `Central server unreachable at ${path}: ${(err as Error).message}`;
      this.logger.warn(message, CentralSyncHttpClientService.context);
      throw new Error(message);
    }

    if (!res.ok) {
      const errorBody = await res.text().catch(() => '');
      const message = `Database Sync ${path} failed (${res.status}): ${errorBody}`;
      this.logger.warn(message, CentralSyncHttpClientService.context);
      throw new Error(message);
    }

    const envelope = (await res.json()) as { data?: T };
    // Central wraps every response in the standard {success, data, ...}
    // envelope (see common/interceptors/response.interceptor.ts) — unwrap it
    // here, mirroring the frontend's unwrapData().
    return envelope.data as T;
  }
}
