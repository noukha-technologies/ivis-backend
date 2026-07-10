import { SyncState, SyncStatusValue } from '../../database/entity/sync-state.entity';

export interface ISyncStateDao {
  ensureSingletonRow(): Promise<SyncState>;
  getStatus(): Promise<SyncState | null>;
  advance(
    id: string,
    fields: {
      last_pulled_at?: Date;
      last_pushed_at?: Date;
      last_sync_status: SyncStatusValue;
      last_error?: string | null;
    },
  ): Promise<void>;
}
