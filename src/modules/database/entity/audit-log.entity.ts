import { Column, CreateDateColumn, Entity, Index } from 'typeorm';
import { SnowflakePrimaryColumn } from './snowflake-id.column';
import { DATABASE_SCHEMAS } from '../../../common/constants/database-schemas';
import { bigintAsStringTransformer } from '../../../common/utils/bigint-string.transformer';

export const AUDIT_ACTION_VALUES = [
  'CREATE',
  'UPDATE',
  'DELETE',
  'RESTORE',
  'LOGIN',
  'LOGOUT',
] as const;

export type AuditActionValue = (typeof AUDIT_ACTION_VALUES)[number];

/**
 * Append-only user activity trail: who did what, when, and from where.
 */
@Entity({ name: 'audit_logs', schema: DATABASE_SCHEMAS.CORE })
export class AuditLog {
  @SnowflakePrimaryColumn()
  id!: string;

  @Column({
    type: 'bigint',
    nullable: true,
    transformer: bigintAsStringTransformer,
  })
  @Index('IDX_AUDIT_LOGS_USER_ID')
  user_id?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  user_name?: string | null;

  @Column({ type: 'varchar', length: 32 })
  @Index('IDX_AUDIT_LOGS_ACTION')
  action!: AuditActionValue;

  @Column({ type: 'varchar', length: 128, nullable: true })
  @Index('IDX_AUDIT_LOGS_ENTITY_TYPE')
  entity_type?: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  entity_id?: string | null;

  @Column({ type: 'varchar', length: 512 })
  description!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip_address?: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  user_agent?: string | null;

  @Column({ type: 'jsonb', nullable: true })
  before?: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  after?: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz', default: () => 'NOW()' })
  @Index('IDX_AUDIT_LOGS_CREATED_AT')
  created_at!: Date;
}
