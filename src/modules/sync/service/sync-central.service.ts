import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { AppLogger } from '../../../common/logger/app.logger';
import { ErrorException } from '../../../common/errors/custom-error.exception';
import { upsertWithUpdate } from '../../../common/utils/conditional-upsert.util';
import { SYNC_ENTITY_MAP, CHUNK_SIZE } from '../sync-entity-map';
import { SyncRunLogDao } from '../../database/dao/sync-run-log.dao';

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

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly syncRunLogDao: SyncRunLogDao,
    private readonly logger: AppLogger,
  ) {}

  async startRun(): Promise<{ runId: string }> {
    const run = await this.syncRunLogDao.startRun();
    return { runId: run.id };
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

    const accepted = await upsertWithUpdate(this.dataSource.manager, definition.entityClass, rows, {
      conditional: definition.conditional,
      conflictColumns: definition.conflictColumns,
      conflictIndexPredicate: definition.conflictIndexPredicate,
    });

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
  ): Promise<{ rows: Record<string, unknown>[]; hasMore: boolean; nextCursor: string | null }> {
    const definition = SYNC_ENTITY_MAP[entityKey];
    if (!definition?.pull) {
      throw new ErrorException(
        'FORBIDDEN_REQUEST',
        `${entityKey} is not configured for pull (direction: ${definition?.direction ?? 'NOT_SYNCED'})`,
      );
    }

    const cursor = cursorIso ? new Date(cursorIso) : EPOCH;
    const rows = await definition.pull(this.dataSource, centreId, cursor);
    await this.syncRunLogDao.recordChunk(runId, 'pulled', entityKey, rows.length);

    const hasMore = rows.length === CHUNK_SIZE;
    const nextCursor = rows.length
      ? (rows[rows.length - 1] as { updated_at?: Date }).updated_at?.toISOString() ?? null
      : cursorIso ?? null;
    return { rows, hasMore, nextCursor };
  }

  async finishRun(runId: string, status: 'SUCCESS' | 'PARTIAL' | 'FAILED', error?: string): Promise<void> {
    await this.syncRunLogDao.finishRun(runId, status, error ?? null);
    this.logger.log(`Sync run ${runId} finished: ${status}`, SyncCentralService.context);
  }

  async recentRuns(limit = 20) {
    return this.syncRunLogDao.findRecent(limit);
  }
}
