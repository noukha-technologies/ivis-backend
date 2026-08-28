import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  UpdateDateColumn,
} from 'typeorm';

import { SnowflakePrimaryColumn } from './snowflake-id.column';
import { bigintAsStringTransformer } from '../../../common/utils/bigint-string.transformer';

import { DATABASE_SCHEMAS } from '../../../common/enums/common.enums';
import { IConfigurationFields } from '../../../common/interfaces/common.interfaces';

import { Centre } from './centre.entity';

@Entity({ name: 'configuration', schema: DATABASE_SCHEMAS.CORE })
export class Configurations implements IConfigurationFields {
  @SnowflakePrimaryColumn()
  id!: string;

  @Column({ type: 'integer', unique: true, nullable: false })
  @Index('IDX_CONFIGURATION_CONFIGURATION_ID', { unique: true })
  configuration_id!: number;

  /* One configuration row per centre. */
  @Column({
    type: 'bigint',
    transformer: bigintAsStringTransformer,
    nullable: false,
  })
  @Index('IDX_CONFIGURATION_CENTRE_ID', { unique: true })
  centre_id!: string;

  @OneToOne(() => Centre, { nullable: false })
  @JoinColumn({ name: 'centre_id' })
  centre!: Centre;

  /**
   * 'Manual' → show the Sync Now button; 'Automatic' → push to central on the
   * fixed twice-daily schedule (SyncSchedulerService).
   *
   * The run times used to live here as sync_time_morning/sync_time_evening.
   * They were never read by anything — no scheduler existed — and the only
   * choice they offered was to move the run into the working day, so the
   * schedule is now fixed in code. The columns are dropped in AlterSchema.
   */
  @Column({ type: 'varchar', length: 16, default: 'Manual', nullable: false })
  sync_mode!: string;

  @Column({ type: 'boolean', default: true })
  redo_test_enabled!: boolean;

  @Column({ type: 'boolean', default: false })
  auto_close!: boolean;

  /** Time-of-day (Oman) to auto-close jobs from available OUT files — 'HH:mm'. */
  @Column({ type: 'varchar', length: 5, nullable: true })
  auto_close_time?: string;

  @Column({ type: 'varchar', length: 5, nullable: true })
  working_hours_start?: string;

  @Column({ type: 'varchar', length: 5, nullable: true })
  working_hours_end?: string;

  @Column({ type: 'varchar', default: 'Active', nullable: false })
  status!: string;

  @Column({ type: 'varchar', nullable: true })
  created_by?: string;

  @CreateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  updated_at!: Date;

  @Column({ type: 'boolean', default: false })
  is_deleted!: boolean;
}
