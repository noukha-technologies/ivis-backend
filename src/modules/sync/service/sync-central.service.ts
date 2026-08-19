import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryFailedError } from 'typeorm';

import { AppLogger } from '../../../common/logger/app.logger';
import { ErrorException } from '../../../common/errors/custom-error.exception';
import { upsertWithUpdate } from '../../../common/utils/conditional-upsert.util';
import { SYNC_ENTITY_MAP, CHUNK_SIZE } from '../sync-entity-map';
import { SyncRunLogDao } from '../../database/dao/sync-run-log.dao';
import { ALTER_SCHEMA_VERSION } from '../../../migrations/1782010000000-AlterSchema';

const EPOCH = new Date(0);

/**
 * Central-side handlers for one sync run's chunked push/pull calls — see
 * Database_sync_arch_replan.md §3/§3a/§7. Runs only on a NODE_ROLE=central
 * deployment; writes/reads its own local DataSource directly (central IS
 * the DB these calls are landing in/reading from).
 */
@Injectable()
export class SyncCentralService {
  private static readonly context = 'SyncCentralService';
  private static readonly POSTGRES_NOT_NULL_VIOLATION = '23502';

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly syncRunLogDao: SyncRunLogDao,
    private readonly logger: AppLogger,
  ) {}

  /**
   * Opens a run and reconciles the two sides' schemas before any rows move.
   *
   * A centre BEHIND central is refused: central's newer columns are absent from
   * the centre's entity metadata, so its upsert would read them as undefined,
   * write null, and report SUCCESS — silent, permanent data loss on every run.
   * Better to fail loudly and have someone deploy the build.
   *
   * A centre AHEAD is allowed with a warning: its extra columns are the ones
   * central ignores, so the loss is confined to data central was never designed
   * to hold yet, and blocking would stall a staged rollout for no gain.
   */
  async startRun(
    centreId: string,
    centreSchemaVersion?: number,
    centreEntityKeys?: string[],
  ): Promise<{
    runId: string;
    centralSchemaVersion: number;
    compatible: boolean;
    schemaDrift: string[];
  }> {
    const drift: string[] = [];
    let compatible = true;

    if (centreSchemaVersion === undefined) {
      drift.push(
        'Centre did not declare a schema version (build predates the handshake) — compatibility could not be verified.',
      );
    } else if (centreSchemaVersion < ALTER_SCHEMA_VERSION) {
      compatible = false;
      drift.push(
        `Centre schema version ${centreSchemaVersion} is behind central ${ALTER_SCHEMA_VERSION}. ` +
          `Columns added since would be silently dropped, so this run is refused. Deploy the current build to this centre.`,
      );
    } else if (centreSchemaVersion > ALTER_SCHEMA_VERSION) {
      drift.push(
        `Centre schema version ${centreSchemaVersion} is ahead of central ${ALTER_SCHEMA_VERSION}. ` +
          `Columns the centre added are not stored centrally yet — update central to match.`,
      );
    }

    if (centreEntityKeys?.length) {
      const centralKeys = new Set(Object.keys(SYNC_ENTITY_MAP));
      const centreKeys = new Set(centreEntityKeys);

      const missingAtCentre = [...centralKeys].filter((k) => !centreKeys.has(k));
      if (missingAtCentre.length) {
        drift.push(
          `Central syncs entities this centre does not know, so they will never be requested: ${missingAtCentre.join(', ')}.`,
        );
      }

      const unknownToCentral = [...centreKeys].filter(
        (k) => !centralKeys.has(k),
      );
      if (unknownToCentral.length) {
        drift.push(
          `Centre expects entities central does not sync: ${unknownToCentral.join(', ')}.`,
        );
      }
    }

    const run = await this.syncRunLogDao.startRun();

    if (drift.length) {
      this.logger.warn(
        `Sync run ${run.id} for centre ${centreId} — schema drift (compatible=${compatible}): ${drift.join(' ')}`,
        SyncCentralService.context,
      );
    }

    // An incompatible run is closed immediately rather than left IN_PROGRESS:
    // the centre aborts on the response, so nothing else will ever finish it.
    if (!compatible) {
      await this.syncRunLogDao.finishRun(run.id, 'FAILED', drift.join(' '));
    }

    return {
      runId: run.id,
      centralSchemaVersion: ALTER_SCHEMA_VERSION,
      compatible,
      schemaDrift: drift,
    };
  }

  async pushChunk(
    runId: string,
    centreId: string,
    entityKey: string,
    chunkIndex: number,
    rows: Record<string, unknown>[],
  ): Promise<{ accepted: number; hasMore: boolean; nextChunkIndex: number }> {
    const definition = SYNC_ENTITY_MAP[entityKey];
    if (!definition || definition.direction === 'READ_ONLY') {
      throw new ErrorException(
        'FORBIDDEN_REQUEST',
        `${entityKey} is not configured for push (direction: ${definition?.direction ?? 'NOT_SYNCED'})`,
      );
    }

    let accepted: number;
    try {
      accepted = await upsertWithUpdate(
        this.dataSource.manager,
        definition.entityClass,
        rows,
        {
          conditional: definition.conditional,
          conflictColumns: definition.conflictColumns,
          conflictIndexPredicate: definition.conflictIndexPredicate,
          localOnlyColumns: definition.localOnlyColumns,
        },
      );
    } catch (error) {
      // Mirror of the centre-side translation: a centre on an older build omits
      // a column central now requires, so the insert writes null and NOT NULL
      // rejects it. Named here so the centre's run log says "schema drift"
      // rather than carrying a raw Postgres string back across the wire.
      if (
        error instanceof QueryFailedError &&
        (error as { code?: string }).code ===
          SyncCentralService.POSTGRES_NOT_NULL_VIOLATION
      ) {
        const column = (error as { column?: string }).column;
        throw new ErrorException(
          'BAD_REQUEST',
          `SCHEMA DRIFT on ${entityKey}: this centre did not supply required column "${column ?? 'unknown'}" — its build is behind central.`,
        );
      }
      throw error;
    }

    await this.syncRunLogDao.recordChunk(runId, 'pushed', entityKey, accepted);

    // hasMore is decided by the CENTRE (it knows if there's another local
    // chunk after this one) — central just acks what it received. A full
    // chunk (== CHUNK_SIZE) is a hint the centre likely has more.
    const hasMore = rows.length === CHUNK_SIZE;
    return { accepted, hasMore, nextChunkIndex: chunkIndex + 1 };
  }

  async pullChunk(
    runId: string,
    centreId: string,
    entityKey: string,
    cursorIso?: string,
  ): Promise<{
    rows: Record<string, unknown>[];
    hasMore: boolean;
    nextCursor: string | null;
  }> {
    const definition = SYNC_ENTITY_MAP[entityKey];
    if (!definition?.pull) {
      throw new ErrorException(
        'FORBIDDEN_REQUEST',
        `${entityKey} is not configured for pull (direction: ${definition?.direction ?? 'NOT_SYNCED'})`,
      );
    }

    const cursor = cursorIso ? new Date(cursorIso) : EPOCH;
    const rows = await definition.pull(this.dataSource, centreId, cursor);
    await this.syncRunLogDao.recordChunk(
      runId,
      'pulled',
      entityKey,
      rows.length,
    );

    const hasMore = rows.length === CHUNK_SIZE;
    const nextCursor = rows.length
      ? ((
          rows[rows.length - 1] as { updated_at?: Date }
        ).updated_at?.toISOString() ?? null)
      : (cursorIso ?? null);
    return { rows, hasMore, nextCursor };
  }

  async finishRun(
    runId: string,
    status: 'SUCCESS' | 'PARTIAL' | 'FAILED',
    error?: string,
  ): Promise<void> {
    await this.syncRunLogDao.finishRun(runId, status, error ?? null);
    this.logger.log(
      `Sync run ${runId} finished: ${status}`,
      SyncCentralService.context,
    );
  }

  async recentRuns(limit = 20) {
    return this.syncRunLogDao.findRecent(limit);
  }
}
