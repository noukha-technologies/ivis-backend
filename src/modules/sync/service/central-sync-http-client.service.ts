import { Injectable } from '@nestjs/common';
import { AppLogger } from '../../../common/logger/app.logger';
import { CentreDao } from '../../database/dao/centre.dao';
import { OnboardingStatusDao } from '../../database/dao/onboarding-status.dao';
import { ALTER_SCHEMA_VERSION } from '../../../migrations/1782010000000-AlterSchema';
import { SYNC_ENTITY_MAP } from '../sync-entity-map';

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

  constructor(
    private readonly logger: AppLogger,
    private readonly centreDao: CentreDao,
    private readonly onboardingStatusDao: OnboardingStatusDao,
  ) {}

  private baseUrl(): string {
    const url = process.env.CENTRAL_SYNC_API_URL?.trim();
    if (!url) {
      throw new Error('CENTRAL_SYNC_API_URL is not configured');
    }
    return url.replace(/\/$/, '');
  }

  /**
   * The credential this centre presents to central.
   *
   * Prefers the key the central server issued to this centre at onboarding and
   * stored on its own `centres` row; falls back to CENTRAL_SYNC_API_KEY for a
   * box that predates that flow or is being driven by hand in development.
   *
   * The env fallback is also where a placeholder tends to sit — `.env` shipped
   * with a literal `<the real central-server API key/token>` for a while, which
   * passed a bare empty-check and then failed as a confusing 401 from central.
   * Anything still wrapped in angle brackets is treated as unconfigured so the
   * error names the real problem, locally.
   */
  private async apiKey(): Promise<string> {
    const issued = await this.issuedKey();
    if (issued) return issued;

    const key = process.env.CENTRAL_SYNC_API_KEY?.trim();
    if (!key) {
      throw new Error(
        'No Database Sync credential: this centre has no issued key, and CENTRAL_SYNC_API_KEY is not set.',
      );
    }
    if (key.startsWith('<') || key.endsWith('>')) {
      throw new Error(
        `CENTRAL_SYNC_API_KEY is still the placeholder value ("${key}") — replace it with the key issued to this centre.`,
      );
    }
    return key;
  }

  /** This centre's stored key, or null if it was never issued one. */
  private async issuedKey(): Promise<string | null> {
    const onboarding = await this.onboardingStatusDao.getStatus();
    const centreId = onboarding?.centre_id;
    if (!centreId) return null;

    const centre = await this.centreDao.findOne({ where: { id: centreId } });
    return centre?.sync_api_key?.trim() || null;
  }

  /**
   * Opens a run, declaring this centre's schema version and entity coverage so
   * central can refuse before any rows move (see SyncCentralService.startRun).
   */
  async startRun(): Promise<{
    runId: string;
    centralSchemaVersion?: number;
    compatible?: boolean;
    schemaDrift?: string[];
  }> {
    return this.post('/sync/run/start', {
      schemaVersion: ALTER_SCHEMA_VERSION,
      entityKeys: Object.keys(SYNC_ENTITY_MAP),
    });
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
    const key = await this.apiKey();

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl()}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${key}`,
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
