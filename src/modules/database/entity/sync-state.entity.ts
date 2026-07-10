import { Column, CreateDateColumn, Entity, UpdateDateColumn } from 'typeorm';
import { SnowflakePrimaryColumn } from './snowflake-id.column';
import { DATABASE_SCHEMAS } from '../../../common/constants/database-schemas';

export const SYNC_STATUS_VALUES = ['SUCCESS', 'PARTIAL', 'FAILED'] as const;
export type SyncStatusValue = (typeof SYNC_STATUS_VALUES)[number];

// Single-row table: tracks this local DB's Database Sync cursors (ongoing,
// bidirectional — separate system from OnboardingStatus, which only tracks
// the one-time Onboarding Sync). last_pulled_at / last_pushed_at only ever
// advance past a row's updated_at once that row has been synced successfully.
@Entity({ name: 'sync_state', schema: DATABASE_SCHEMAS.CORE })
export class SyncState {
  @SnowflakePrimaryColumn()
  id!: string;

  @Column({ type: 'timestamp', nullable: true })
  last_pulled_at?: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  last_pushed_at?: Date | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  last_sync_status?: SyncStatusValue | null;

  @Column({ type: 'varchar', nullable: true })
  last_error?: string | null;

  @CreateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  updated_at!: Date;
}
