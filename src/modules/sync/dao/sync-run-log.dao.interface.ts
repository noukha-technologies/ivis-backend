import {
  SyncRunLog,
  SyncRunStatusValue,
} from '../../database/entity/sync-run-log.entity';

export interface ISyncRunLogDao {
  /** Creates a new IN_PROGRESS run row — called once at the start of a sync run. */
  startRun(): Promise<SyncRunLog>;

  /** Merges the given per-entity counts into the run's pushed/pulled totals (additive, one call per chunk). */
  recordChunk(
    id: string,
    direction: 'pushed' | 'pulled',
    entityKey: string,
    count: number,
  ): Promise<void>;

  finishRun(
    id: string,
    status: SyncRunStatusValue,
    error?: string | null,
  ): Promise<void>;

  findRecent(limit: number): Promise<SyncRunLog[]>;
}
