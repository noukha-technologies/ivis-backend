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

/**
 * Which half of a run to perform.
 *
 * The two directions carry different data and are wanted at different times:
 * a centre pushes its day's transactions constantly, but only needs central's
 * masters when someone has changed them. Splitting them keeps the routine
 * action cheap instead of re-walking every read-only table on every run.
 *
 * `full` keeps push-then-pull ordering, which matters for the BIDIRECTIONAL
 * entities: local edits go up before central's copy comes back down, so a
 * local change made since the last run wins its own conflict.
 */
export type SyncMode = 'push' | 'pull' | 'full';

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
  private static readonly POSTGRES_NOT_NULL_VIOLATION = '23502';
  /** Entities already reported for ignored columns this run — see warnOnIgnoredColumns. */
  private readonly reportedIgnoredColumns = new Set<string>();

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly onboardingStatusDao: OnboardingStatusDao,
    private readonly syncRunLogDao: SyncRunLogDao,
    private readonly centralClient: CentralSyncHttpClientService,
    private readonly syncGateway: SyncGateway,
    private readonly logger: AppLogger,
  ) {}

  async runSync(mode: SyncMode = 'full'): Promise<SyncRunResult> {
    const onboarding = await this.onboardingStatusDao.getStatus();
    if (
      !onboarding ||
      onboarding.status !== 'COMPLETED' ||
      !onboarding.centre_id
    ) {
      throw new Error(
        'Database Sync can only run once this centre has completed Onboarding Sync.',
      );
    }

    // Per-run, so a drift warning silenced on one run reappears on the next
    // until someone actually deploys the fix.
    this.reportedIgnoredColumns.clear();

    const localRun = await this.syncRunLogDao.startRun();

    let runId: string;
    let handshake: Awaited<
      ReturnType<typeof this.centralClient.startRun>
    > | null = null;
    try {
      handshake = await this.centralClient.startRun();
      runId = handshake.runId;
    } catch (error) {
      // Central unreachable (or misconfigured, e.g. missing API key/URL) before
      // any work started — finalize the row as FAILED instead of leaving it
      // orphaned at IN_PROGRESS forever.
      const message = error instanceof Error ? error.message : String(error);
      await this.syncRunLogDao.finishRun(localRun.id, 'FAILED', message);
      this.logger.error(
        `Database Sync failed to start a central run: ${message}`,
        error instanceof Error ? error.stack : undefined,
        DatabaseSyncService.context,
      );
      const result: SyncRunResult = {
        status: 'FAILED',
        pulled: {},
        pushed: {},
        error: message,
      };
      this.syncGateway.broadcastSyncRunComplete(result);
      return result;
    }

    // Schema drift that central rated incompatible: stop before moving a single
    // row. Proceeding would write nulls into every column this build does not
    // know about and still report SUCCESS, which is worse than not syncing.
    if (handshake.compatible === false) {
      const message = `Schema mismatch with central — sync aborted. ${(handshake.schemaDrift ?? []).join(' ')}`;
      await this.syncRunLogDao.finishRun(localRun.id, 'FAILED', message);
      this.logger.error(message, undefined, DatabaseSyncService.context);
      const aborted: SyncRunResult = {
        status: 'FAILED',
        pulled: {},
        pushed: {},
        error: message,
      };
      this.syncGateway.broadcastSyncRunComplete(aborted);
      return aborted;
    }

    // Compatible but not identical — worth recording, not worth blocking.
    if (handshake.schemaDrift?.length) {
      this.logger.warn(
        `Database Sync schema drift (proceeding): ${handshake.schemaDrift.join(' ')}`,
        DatabaseSyncService.context,
      );
    }

    const result: SyncRunResult = { status: 'SUCCESS', pulled: {}, pushed: {} };
    const doPush = mode === 'push' || mode === 'full';
    const doPull = mode === 'pull' || mode === 'full';

    // A phase that never ran is neither ok nor failed. Seeded true so it does
    // not drag a single-phase run down to PARTIAL — a push-only run that
    // pushed everything is a SUCCESS, not a half-finished full sync.
    let pushOk = true;
    let pullOk = true;

    if (doPush) {
      try {
        await this.pushPhase(runId, localRun.id, result);
      } catch (error) {
        pushOk = false;
        result.error = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Database Sync push phase failed: ${result.error}`,
          error instanceof Error ? error.stack : undefined,
          DatabaseSyncService.context,
        );
      }
    }

    if (doPull) {
      try {
        await this.pullPhase(runId, localRun.id, result);
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
    }

    // PARTIAL only means something in a run that attempted both phases.
    const ranBoth = doPush && doPull;
    result.status =
      pushOk && pullOk
        ? 'SUCCESS'
        : ranBoth && (pushOk || pullOk)
          ? 'PARTIAL'
          : 'FAILED';

    await this.syncRunLogDao.finishRun(
      localRun.id,
      result.status,
      result.error ?? null,
    );
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
      `Database Sync run ${runId} (${mode}): ${result.status} — pushed ${JSON.stringify(result.pushed)}, pulled ${JSON.stringify(result.pulled)}`,
      DatabaseSyncService.context,
    );

    this.syncGateway.broadcastSyncRunComplete(result);

    return result;
  }

  // ─── PUSH PHASE (this centre → central) — chunked per entity ────────────

  /**
   * @param runId    central's run id — identifies the run across the wire
   * @param localRunId this box's own sync_run_logs row, which the Sync Log
   *   table reads. Recorded separately because central's counts live in
   *   central's database; without this the local history showed a run as
   *   SUCCESS with 0 pushed and 0 pulled, which reads as "nothing happened".
   */
  private async pushPhase(
    runId: string,
    localRunId: string,
    result: SyncRunResult,
  ): Promise<void> {
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
          const ack = await this.centralClient.pushChunk(
            runId,
            entityKey,
            chunkIndex,
            plainRows,
          );
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
        if (totalPushed > 0) {
          await this.syncRunLogDao.recordChunk(
            localRunId,
            'pushed',
            entityKey,
            totalPushed,
          );
        }
        this.syncGateway.broadcastSyncActivity({
          phase: 'push',
          entityKey,
          status: 'completed',
          message: `Pushed ${totalPushed} row${totalPushed === 1 ? '' : 's'}`,
          count: totalPushed,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Database Sync push: ${entityKey} failed — ${message}`,
          DatabaseSyncService.context,
        );
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

  /** See pushPhase for why localRunId is carried alongside central's runId. */
  private async pullPhase(
    runId: string,
    localRunId: string,
    result: SyncRunResult,
  ): Promise<void> {
    for (const entityKey of PULL_ORDER) {
      const definition = SYNC_ENTITY_MAP[entityKey];
      if (
        definition?.direction !== 'READ_ONLY' &&
        definition?.direction !== 'BIDIRECTIONAL'
      ) {
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
        const response = await this.centralClient.pullChunk(
          runId,
          entityKey,
          cursor,
        );
        if (!response.rows.length) break;

        this.warnOnIgnoredColumns(entityKey, definition.entityClass, response.rows);

        await this.dataSource.transaction(async (manager) => {
          const count = await this.withMissingColumnHealing(
            manager,
            definition.entityClass,
            entityKey,
            () =>
              upsertWithUpdate(
                manager,
                definition.entityClass,
                response.rows as ObjectLiteral[],
                {
                  conditional: definition.conditional,
                  conflictColumns: definition.conflictColumns,
                  conflictIndexPredicate: definition.conflictIndexPredicate,
                  localOnlyColumns: definition.localOnlyColumns,
                  localSequenceColumns: definition.localSequenceColumns,
                },
              ),
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
      if (totalPulled > 0) {
        await this.syncRunLogDao.recordChunk(
          localRunId,
          'pulled',
          entityKey,
          totalPulled,
        );
      }
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
  /**
   * Names the fields central sent that this build has nowhere to put.
   *
   * The upsert reads values by walking LOCAL entity metadata, so any extra key
   * in the payload is silently skipped — a centre on an old build lost every
   * new column with no error and a SUCCESS result. The handshake refuses that
   * case outright now; this covers what slips past it, notably a centre running
   * a build with the same schema version but a stale entity definition.
   *
   * Once per entity per run, not per row — a full chunk would log the same
   * field 500 times.
   */
  private warnOnIgnoredColumns(
    entityKey: string,
    entity: EntityTarget<ObjectLiteral>,
    rows: Record<string, unknown>[],
  ): void {
    if (this.reportedIgnoredColumns.has(entityKey)) return;

    const sample = rows[0];
    if (!sample) return;

    const known = new Set(
      this.dataSource
        .getMetadata(entity)
        .columns.flatMap((c) => [c.propertyName, c.databaseName]),
    );
    const ignored = Object.keys(sample).filter((key) => !known.has(key));

    this.reportedIgnoredColumns.add(entityKey);
    if (!ignored.length) return;

    this.logger.warn(
      `⚠ Database Sync: central sent ${ignored.length} field(s) on ${entityKey} that this build does not know — ` +
        `they were NOT stored: ${ignored.join(', ')}. Deploy the matching build to this centre.`,
      DatabaseSyncService.context,
    );
  }

  private async withMissingColumnHealing<T>(
    manager: EntityManager,
    entity: EntityTarget<ObjectLiteral>,
    label: string,
    attempt: () => Promise<T>,
  ): Promise<T> {
    try {
      return await attempt();
    } catch (error) {
      // A column this build requires but the sender dropped: the payload has no
      // value, the upsert writes null, and NOT NULL rejects it. Nothing local
      // can fix that, so re-raise it named — otherwise it surfaces as a bare
      // Postgres string and reads like a data bug rather than a version gap.
      if (
        error instanceof QueryFailedError &&
        (error as { code?: string }).code ===
          DatabaseSyncService.POSTGRES_NOT_NULL_VIOLATION
      ) {
        const column = (error as { column?: string }).column;
        throw new Error(
          `SCHEMA DRIFT on ${label}: required column "${column ?? 'unknown'}" was not supplied by the other side ` +
            `— its build is missing this column, or dropped it. Align the schema versions.`,
        );
      }

      if (
        !(error instanceof QueryFailedError) ||
        (error as { code?: string }).code !==
          DatabaseSyncService.POSTGRES_UNDEFINED_COLUMN
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

      const columnOptions = TableUtils.createTableColumnOptions(
        columnMetadata,
        manager.connection.driver,
      );
      await manager.queryRunner!.addColumn(
        `${metadata.schema}.${metadata.tableName}`,
        new TableColumn(columnOptions),
      );

      return await attempt();
    }
  }
}
