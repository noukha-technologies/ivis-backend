import {
  Column,
  CreateDateColumn,
  Entity,
  UpdateDateColumn,
} from 'typeorm';
import { SnowflakePrimaryColumn } from './snowflake-id.column';
import { bigintAsStringTransformer } from '../../../common/utils/bigint-string.transformer';
import { DATABASE_SCHEMAS } from '../../../common/constants/database-schemas';
import { OnboardingStatusValue } from '../../../common/enums/onboarding.enums';

// Single-row table: tracks this local DB's Onboarding Sync lifecycle.
// COMPLETED + a pinned centre_id means the flag-first login check can skip
// the central DB entirely — see AuthService.login().
@Entity({ name: 'onboarding_status', schema: DATABASE_SCHEMAS.CORE })
export class OnboardingStatus {
  @SnowflakePrimaryColumn()
  id!: string;

  @Column({
    type: 'bigint',
    transformer: bigintAsStringTransformer,
    nullable: true,
  })
  centre_id?: string | null;

  @Column({ type: 'varchar', nullable: true })
  centre_code?: string | null;

  @Column({ type: 'varchar', length: 32, default: 'PENDING' })
  status!: OnboardingStatusValue;

  @Column({ type: 'timestamp', nullable: true })
  confirmation_expires_at?: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  schema_initialized_at?: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  data_synced_at?: Date | null;

  @Column({ type: 'varchar', nullable: true })
  last_error?: string | null;

  @CreateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  updated_at!: Date;
}
