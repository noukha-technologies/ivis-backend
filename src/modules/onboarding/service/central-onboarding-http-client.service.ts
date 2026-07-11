import { Injectable } from '@nestjs/common';
import { AppLogger } from '../../../common/logger/app.logger';

export interface OnboardingConfirmResult {
  status: 'CONFIRMATION_REQUIRED';
  centreId: string;
  centreName: string;
  centreCode: string;
  centreAdminRoleExists: boolean;
  availableSuperAdminIds: string[];
  pullToken: string;
}

export interface OnboardingPullChunkResult {
  rows: Record<string, unknown>[];
  hasMore: boolean;
  nextCursor: string | null;
}

export interface OnboardingPullCompleteResult {
  apiKey: string;
  reScopedSuperAdmins: Record<string, unknown>[];
}

export interface VerifyCentralResult {
  valid: boolean;
  userId?: string;
  accessScope?: string;
  isGlobalScope?: boolean;
}

/**
 * Centre-side HTTP client for Onboarding Sync's central endpoints — see
 * Database_sync_arch_replan.md §5. Plain fetch, env-driven base URL, modeled
 * directly on modules/integrations/payment/payment-api-client.service.ts's
 * confirmed pattern. Unlike that client, onboarding failures must surface
 * clearly (not silently degrade to null) — a login attempt needs to know
 * exactly why onboarding failed, so every method throws on failure instead
 * of returning null.
 */
@Injectable()
export class CentralOnboardingHttpClientService {
  private static readonly context = 'CentralOnboardingHttpClientService';

  constructor(private readonly logger: AppLogger) {}

  private baseUrl(): string {
    const url = process.env.CENTRAL_SYNC_API_URL?.trim();
    if (!url) {
      throw new Error('CENTRAL_SYNC_API_URL is not configured');
    }
    return url.replace(/\/$/, '');
  }

  async verifyCentral(email: string, password: string): Promise<VerifyCentralResult> {
    return this.post<VerifyCentralResult>('/onboarding/verify-central', { email, password });
  }

  async resolveReScopedRow(email: string, centreId: string): Promise<Record<string, unknown>> {
    const { row } = await this.post<{ row: Record<string, unknown> }>('/onboarding/resolve-rescoped-row', {
      email,
      centreId,
    });
    return row;
  }

  async confirm(email: string, password: string): Promise<OnboardingConfirmResult> {
    return this.post<OnboardingConfirmResult>('/onboarding/confirm', { email, password });
  }

  async pullStart(pullToken: string, selectedSuperAdminIds: string[]): Promise<{ pullSessionId: string }> {
    return this.post('/onboarding/pull/start', { pullToken, selectedSuperAdminIds });
  }

  async pullChunk(
    pullSessionId: string,
    entityKey: string,
    cursor?: string,
  ): Promise<OnboardingPullChunkResult> {
    return this.post('/onboarding/pull/chunk', { pullSessionId, entityKey, cursor });
  }

  /** Cross-centre FK top-up — Role/Line/Centre/Permission by specific ids, no centre-scoping. */
  async pullByIds(
    pullSessionId: string,
    entityKey: string,
    ids: string[],
  ): Promise<Record<string, unknown>[]> {
    if (!ids.length) return [];
    const { rows } = await this.post<{ rows: Record<string, unknown>[] }>('/onboarding/pull/by-ids', {
      pullSessionId,
      entityKey,
      ids,
    });
    return rows;
  }

  async pullComplete(pullSessionId: string): Promise<OnboardingPullCompleteResult> {
    return this.post('/onboarding/pull/complete', { pullSessionId });
  }

  private async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl()}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (err) {
      const message = `Central server unreachable at ${path}: ${(err as Error).message}`;
      this.logger.warn(message, CentralOnboardingHttpClientService.context);
      throw new Error(message);
    }

    if (!res.ok) {
      const errorBody = await res.text().catch(() => '');
      const message = `Central onboarding ${path} failed (${res.status}): ${errorBody}`;
      this.logger.warn(message, CentralOnboardingHttpClientService.context);
      throw new Error(message);
    }

    return (await res.json()) as T;
  }
}
