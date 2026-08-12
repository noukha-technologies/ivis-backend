import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

import { ISyncRunLogDao } from '../../sync/dao/sync-run-log.dao.interface';
import { SyncRunLog, SyncRunStatusValue } from '../entity/sync-run-log.entity';
import { generateSnowflakeId } from '../../../common/shared/snowflakeIdGeneration';

@Injectable()
export class SyncRunLogDao
  extends Repository<SyncRunLog>
  implements ISyncRunLogDao
{
  constructor(private readonly dataSource: DataSource) {
    super(SyncRunLog, dataSource.createEntityManager());
  }

  async startRun(): Promise<SyncRunLog> {
    return this.save(
      this.create({
        id: generateSnowflakeId(),
        started_at: new Date(),
        status: 'IN_PROGRESS',
        pushed: {},
        pulled: {},
      }),
    );
  }

  async recordChunk(
    id: string,
    direction: 'pushed' | 'pulled',
    entityKey: string,
    count: number,
  ): Promise<void> {
    // jsonb_set with COALESCE so concurrent chunk calls for different entities
    // never clobber each other's keys — accumulates onto whatever's already there.
    const column = direction;
    await this.createQueryBuilder()
      .update(SyncRunLog)
      .set({
        [column]: () =>
          `jsonb_set(COALESCE("${column}", '{}'::jsonb), '{${entityKey}}', ` +
          `(COALESCE(("${column}"->>'${entityKey}')::int, 0) + ${count})::text::jsonb)`,
      })
      .where('id = :id', { id })
      .execute();
  }

  async finishRun(
    id: string,
    status: SyncRunStatusValue,
    error?: string | null,
  ): Promise<void> {
    await this.createQueryBuilder()
      .update(SyncRunLog)
      .set({ status, finished_at: new Date(), error: error ?? null })
      .where('id = :id', { id })
      .execute();
  }

  async findRecent(limit: number): Promise<SyncRunLog[]> {
    return this.createQueryBuilder('sync_run_log')
      .orderBy('sync_run_log.started_at', 'DESC')
      .limit(limit)
      .getMany();
  }
}
