import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  EntityTarget,
  ObjectLiteral,
  QueryFailedError,
  TableColumn,
} from 'typeorm';
import { TableUtils } from 'typeorm/schema-builder/util/TableUtils';

import { AppLogger } from '../../../common/logger/app.logger';
import { OnboardingStatusDao } from '../../database/dao/onboarding-status.dao';
import { SyncRunLogDao } from '../../database/dao/sync-run-log.dao';
import { upsertWithUpdate } from '../../../common/utils/conditional-upsert.util';
import { CentralSyncHttpClientService } from './central-sync-http-client.service';
import { SyncGateway } from '../sync.gateway';
import { PULL_ORDER, PUSH_ORDER, SYNC_ENTITY_MAP } from '../sync-entity-map';

const EPOCH = new Date(0);

export type SyncRunStatus = 'SUCCESS' | 'PARTIAL' | 'FAILED';

export interface SyncRunResult {
  status: SyncRunStatus;
  pulled: Record<string, number>;
  pushed: Record<string, number>;
  error?: string;
}

/**
 * Centre-role Database Sync engine — see Database_sync_arch_replan.md
 * §3/§3a. Runs ONLY on a centre whose OnboardingStatus is COMPLETED. No
 * direct DB connection to central anywhere — every push/pull happens as a
 * bounded, chunked HTTPS call via CentralSyncHttpClientService.
 *
 * Push phase: reads local rows changed since last push, chunk by chunk per
 * entity (PUSH_ORDER), POSTs each chunk, advances the local cursor only
 * after a successful ack. Pull phase: requests chunks from central per
 * entity (PULL_ORDER), upserts each chunk locally inside its own
 * transaction (missing-column self-healing preserved from the original
 * engine — see withMissingColumnHealing below).
 *
 * Cursor granularity is per-entity, per-direction — a failure partway
 * through one entity's chunks doesn't lose progress on entities that
 * already finished (see §3a's chunking rules).
 */
@Injectable()
export class DatabaseSyncService {
  private static readonly context = 'DatabaseSyncService';
  private static readonly POSTGRES_UNDEFINED_COLUMN = '42703';

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly onboardingStatusDao: OnboardingStatusDao,
    private readonly syncRunLogDao: SyncRunLogDao,
    private readonly centralClient: CentralSyncHttpClientService,
    private readonly syncGateway: SyncGateway,
    private readonly logger: AppLogger,
  ) {}

  async runSync(): Promise<SyncRunResult> {
    const onboarding = await this.onboardingStatusDao.getStatus();
    if (!onboarding || onboarding.status !== 'COMPLETED' || !onboarding.centre_id) {
      throw new Error('Database Sync can only run once this centre has completed Onboarding Sync.');
    }

    const localRun = await this.syncRunLogDao.startRun();
    const { runId } = await this.centralClient.startRun();

    const result: SyncRunResult = { status: 'SUCCESS', pulled: {}, pushed: {} };
    let pushOk = true;
    let pullOk = true;

    try {
      await this.pushPhase(runId, result);
    } catch (error) {
      pushOk = false;
      result.error = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Database Sync push phase failed: ${result.error}`,
        error instanceof Error ? error.stack : undefined,
        DatabaseSyncService.context,
      );
    }

    try {
      await this.pullPhase(runId, result);
    } catch (error) {
      pullOk = false;
      const message = error instanceof Error ? error.message : String(error);
      result.error = result.error ? `${result.error}; ${message}` : message;
      this.logger.error(
        `Database Sync pull phase failed: ${message}`,
        error instanceof Error ? error.stack : undefined,
        DatabaseSyncService.context,
      );
    }

    result.status = pushOk && pullOk ? 'SUCCESS' : pushOk || pullOk ? 'PARTIAL' : 'FAILED';

    await this.syncRunLogDao.finishRun(localRun.id, result.status, result.error ?? null);
    try {
      await this.centralClient.finishRun(runId, result.status, result.error);
    } catch (error) {
      // Central being unreachable at the very last step shouldn't change the
      // local run's own recorded outcome — already finalized above.
      this.logger.warn(
        `Failed to report run completion to central: ${error instanceof Error ? error.message : String(error)}`,
        DatabaseSyncService.context,
      );
    }

    this.logger.log(
      `Database Sync run ${runId}: ${result.status} — pushed ${JSON.stringify(result.pushed)}, pulled ${JSON.stringify(result.pulled)}`,
      DatabaseSyncService.context,
    );

    this.syncGateway.broadcastSyncRunComplete(result);

    return result;
  }

  // ─── PUSH PHASE (this centre → central) — chunked per entity ────────────

  private async pushPhase(runId: string, result: SyncRunResult): Promise<void> {
    const failures: string[] = [];

    for (const entityKey of PUSH_ORDER) {
      const definition = SYNC_ENTITY_MAP[entityKey];
      if (!definition?.pushLocal) {
        continue;
      }

      this.syncGateway.broadcastSyncActivity({
        phase: 'push',
        entityKey,
        status: 'started',
        message: `Pushing ${entityKey}...`,
      });

      try {
        let cursor = EPOCH;
        let totalPushed = 0;
        let chunkIndex = 0;
        let hasMore = true;

        while (hasMore) {
          const rows = await definition.pushLocal(this.dataSource, cursor);
          if (!rows.length) break;

          const plainRows = rows as unknown as Record<string, unknown>[];
          const ack = await this.centralClient.pushChunk(runId, entityKey, chunkIndex, plainRows);
          totalPushed += ack.accepted;
          chunkIndex = ack.nextChunkIndex;

          const lastRow = rows[rows.length - 1] as { updated_at?: Date };
          cursor = lastRow.updated_at ?? cursor;
          hasMore = ack.hasMore;

          this.syncGateway.broadcastSyncActivity({
            phase: 'push',
            entityKey,
            status: 'started',
            message: `Pushed ${totalPushed} row${totalPushed === 1 ? '' : 's'} so far...`,
            count: totalPushed,
          });
        }

        result.pushed[entityKey] = totalPushed;
        this.syncGateway.broadcastSyncActivity({
          phase: 'push',
          entityKey,
          status: 'completed',
          message: `Pushed ${totalPushed} row${totalPushed === 1 ? '' : 's'}`,
          count: totalPushed,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Database Sync push: ${entityKey} failed — ${message}`, DatabaseSyncService.context);
        this.syncGateway.broadcastSyncActivity({
          phase: 'push',
          entityKey,
          status: 'failed',
          message,
        });
        failures.push(entityKey);
      }
    }

    if (failures.length) {
      throw new Error(`push failed for: ${failures.join(', ')}`);
    }
  }

  // ─── PULL PHASE (central → this centre) — chunked per entity, one transaction per chunk ──

  private async pullPhase(runId: string, result: SyncRunResult): Promise<void> {
    for (const entityKey of PULL_ORDER) {
      const definition = SYNC_ENTITY_MAP[entityKey];
      if (definition?.direction !== 'READ_ONLY' && definition?.direction !== 'BIDIRECTIONAL') {
        continue;
      }

      this.syncGateway.broadcastSyncActivity({
        phase: 'pull',
        entityKey,
        status: 'started',
        message: `Pulling ${entityKey}...`,
      });

      let cursor: string | undefined;
      let totalPulled = 0;
      let hasMore = true;

      while (hasMore) {
        const response = await this.centralClient.pullChunk(runId, entityKey, cursor);
        if (!response.rows.length) break;

        await this.dataSource.transaction(async (manager) => {
          const count = await this.withMissingColumnHealing(manager, definition.entityClass, entityKey, () =>
            upsertWithUpdate(manager, definition.entityClass, response.rows as ObjectLiteral[], {
              conditional: definition.conditional,
              conflictColumns: definition.conflictColumns,
              conflictIndexPredicate: definition.conflictIndexPredicate,
            }),
          );
          totalPulled += count;
        });

        cursor = response.nextCursor ?? cursor;
        hasMore = response.hasMore;

        this.syncGateway.broadcastSyncActivity({
          phase: 'pull',
          entityKey,
          status: 'started',
          message: `Pulled ${totalPulled} row${totalPulled === 1 ? '' : 's'} so far...`,
          count: totalPulled,
        });
      }

      result.pulled[entityKey] = totalPulled;
      this.syncGateway.broadcastSyncActivity({
        phase: 'pull',
        entityKey,
        status: 'completed',
        message: `Pulled ${totalPulled} row${totalPulled === 1 ? '' : 's'}`,
        count: totalPulled,
      });
    }
  }

  /**
   * Wraps a single upsert attempt. If it fails specifically because Postgres
   * reports a missing column (42703), adds that column — typed from the
   * entity's own TypeORM metadata — and retries the upsert exactly once. Any
   * other failure (or a second failure after healing) propagates unchanged,
   * rolling back that chunk's transaction. Preserved verbatim from the
   * original Database Sync engine (see DATABASE_SYNC_HARDENING_PLAN.md) —
   * this hardening logic is orthogonal to the transport change.
   */
  private async withMissingColumnHealing<T>(
    manager: EntityManager,
    entity: EntityTarget<ObjectLiteral>,
    label: string,
    attempt: () => Promise<T>,
  ): Promise<T> {
    try {
      return await attempt();
    } catch (error) {
      if (
        !(error instanceof QueryFailedError) ||
        (error as { code?: string }).code !== DatabaseSyncService.POSTGRES_UNDEFINED_COLUMN
      ) {
        throw error;
      }

      const missingColumnName = (error as { column?: string }).column;
      const metadata = manager.connection.getMetadata(entity);
      const columnMetadata = missingColumnName
        ? metadata.columns.find((c) => c.databaseName === missingColumnName)
        : undefined;
      if (!columnMetadata) {
        throw error;
      }

      this.logger.warn(
        `⚠ Database Sync: SCHEMA DRIFT — column "${columnMetadata.databaseName}" missing on ` +
          `${metadata.schema}.${metadata.tableName} (entity ${label}). Auto-creating it now from entity ` +
          `metadata and retrying. This should still be reconciled with a real migration.`,
        DatabaseSyncService.context,
      );

      const columnOptions = TableUtils.createTableColumnOptions(columnMetadata, manager.connection.driver);
      await manager.queryRunner!.addColumn(
        `${metadata.schema}.${metadata.tableName}`,
        new TableColumn(columnOptions),
      );

      return await attempt();
    }
  }
}
