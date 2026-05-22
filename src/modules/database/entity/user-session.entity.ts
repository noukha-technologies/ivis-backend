import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity.js';
import { SessionMetadata } from '../../../common/interfaces/user.interfaces.js';
import { DatabaseSchemas } from '../../../common/constants/database-schemas.js';
import { bigintAsStringTransformer } from '../bigint-string.transformer.js';

@Entity({ name: 'user_sessions', schema: DatabaseSchemas.CORE })
@Index('IDX_user_sessions_user_jti', ['user_id', 'access_token_jti'])
export class UserSession {
  @PrimaryColumn({ type: 'bigint', transformer: bigintAsStringTransformer })
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

  @CreateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  updated_at!: Date;
}
