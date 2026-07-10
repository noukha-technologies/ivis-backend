import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  UpdateDateColumn,
} from 'typeorm';
import { bigintAsStringTransformer } from '../../../common/utils/bigint-string.transformer';
import { SnowflakePrimaryColumn } from './snowflake-id.column';
import { User } from './user.entity';

export interface SessionMetadata {
  browser: string;
  os: string;
  deviceType: string;
  ipAddress: string;
}

@Entity({ name: 'user_sessions', schema: 'core' })
@Index('IDX_user_sessions_user_jti', ['user_id', 'access_token_jti'])
export class UserSession {
  @SnowflakePrimaryColumn()
  id!: string;

  @Column({ type: 'bigint', transformer: bigintAsStringTransformer })
  user_id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ type: 'varchar' })
  access_token_jti!: string;

  @Column({ type: 'varchar' })
  refresh_token_jti!: string;

  @Column({ type: 'varchar' })
  refresh_token!: string;

  @Column({ type: 'boolean', default: true })
  is_active!: boolean;

  @Column({ type: 'timestamp' })
  expired_at!: Date;

  @Column({ type: 'timestamp', nullable: true })
  last_refreshed_at?: Date;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: SessionMetadata | null;

  @Column({ type: 'varchar', nullable: true })
  created_by?: string;

  /** Set only when this session was minted via Super Admin impersonation — the acting Super Admin's user id. */
  @Column({ type: 'varchar', nullable: true })
  impersonated_by?: string;

  @CreateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  updated_at!: Date;
}
