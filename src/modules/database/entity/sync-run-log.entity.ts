import { Column, CreateDateColumn, Entity, Index } from 'typeorm';
import { SnowflakePrimaryColumn } from './snowflake-id.column';
import { DATABASE_SCHEMAS } from '../../../common/constants/database-schemas';

export const SYNC_RUN_STATUS_VALUES = ['IN_PROGRESS', 'SUCCESS', 'PARTIAL', 'FAILED'] as const;
export type SyncRunStatusValue = (typeof SYNC_RUN_STATUS_VALUES)[number];

/**
 * Append-only history of Database Sync runs (see Database_sync_arch_replan.md
 * §10/§11) — replaces the old single-row sync_state cursor table. One row per
 * run, updated in place as the run progresses through its chunked calls, so a
 * fresh page load can show real past-run history, not just live-session state.
 */
@Entity({ name: 'sync_run_log', schema: DATABASE_SCHEMAS.CORE })
export class SyncRunLog {
  @SnowflakePrimaryColumn()
  id!: string;

  @Column({ type: 'timestamp' })
  @Index('IDX_SYNC_RUN_LOG_STARTED_AT')
  started_at!: Date;

  @Column({ type: 'timestamp', nullable: true })
  finished_at?: Date | null;

  @Column({ type: 'varchar', length: 16, default: 'IN_PROGRESS' })
  status!: SyncRunStatusValue;

  /** Per-entity row counts pushed this run, e.g. { "Job": 500, "Line": 12 }. */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  pushed!: Record<string, number>;

  /** Per-entity row counts pulled this run, e.g. { "Role": 3 }. */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  pulled!: Record<string, number>;

  @Column({ type: 'varchar', nullable: true })
  error?: string | null;

  @CreateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  created_at!: Date;
}
