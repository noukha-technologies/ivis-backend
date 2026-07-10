import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

import { ISyncStateDao } from '../../sync/dao/sync-state.dao.interface';
import { SyncState, SyncStatusValue } from '../entity/sync-state.entity';
import { generateSnowflakeId } from '../../../common/shared/snowflakeIdGeneration';

@Injectable()
export class SyncStateDao extends Repository<SyncState> implements ISyncStateDao {
  constructor(private readonly dataSource: DataSource) {
    super(SyncState, dataSource.createEntityManager());
  }

  async ensureSingletonRow(): Promise<SyncState> {
    const existing = await this.getStatus();
    if (existing) {
      return existing;
    }
    return this.save(this.create({ id: generateSnowflakeId() }));
  }

  async getStatus(): Promise<SyncState | null> {
    return this.createQueryBuilder('sync_state')
      .orderBy('sync_state.created_at', 'ASC')
      .getOne();
  }

  async advance(
    id: string,
    fields: {
      last_pulled_at?: Date;
      last_pushed_at?: Date;
      last_sync_status: SyncStatusValue;
      last_error?: string | null;
    },
  ): Promise<void> {
    await this.createQueryBuilder()
      .update(SyncState)
      .set({ ...fields, updated_at: new Date() })
      .where('id = :id', { id })
      .execute();
  }
}
