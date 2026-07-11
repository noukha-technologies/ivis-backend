import { Column, CreateDateColumn, Entity, Index } from 'typeorm';
import { SnowflakePrimaryColumn } from './snowflake-id.column';
import { bigintAsStringTransformer } from '../../../common/utils/bigint-string.transformer';
import { DATABASE_SCHEMAS } from '../../../common/constants/database-schemas';

/**
 * Central-side only: one API key per centre, minted at the end of that
 * centre's Onboarding Sync pull (see Database_sync_arch_replan.md §4/§5) and
 * used to authenticate every subsequent Database Sync run. key_hash is a
 * bcrypt hash — the plaintext key is returned to the centre exactly once (in
 * the pull-complete response) and never stored anywhere in plaintext,
 * mirroring User.password's hashing convention.
 */
@Entity({ name: 'centre_api_keys', schema: DATABASE_SCHEMAS.CORE })
export class CentreApiKey {
  @SnowflakePrimaryColumn()
  id!: string;

  @Column({ type: 'bigint', transformer: bigintAsStringTransformer })
  @Index('IDX_CENTRE_API_KEYS_CENTRE_ID')
  centre_id!: string;

  @Column({ type: 'varchar' })
  key_hash!: string;

  @CreateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  created_at!: Date;

  @Column({ type: 'timestamp', nullable: true })
  revoked_at?: Date | null;
}
