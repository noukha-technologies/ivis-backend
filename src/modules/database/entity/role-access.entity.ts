import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  UpdateDateColumn,
} from 'typeorm';
import type { RoleAccessMatrix } from '../../../common/types/role-access.types';
import { SnowflakePrimaryColumn } from './snowflake-id.column';

@Entity({ name: 'role_access', schema: 'core' })
@Index('IDX_ROLE_ACCESS_ROLE_NAME', ['role_name'], { unique: true })
export class RoleAccess {
  @SnowflakePrimaryColumn()
  id!: string;

  @Column({ type: 'varchar', length: 64, nullable: false })
  role_name!: string;

  @Column({ type: 'jsonb', nullable: false, default: () => "'{}'" })
  access!: RoleAccessMatrix;

  @Column({ type: 'varchar', nullable: true })
  created_by?: string;

  @CreateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  updated_at!: Date;

  @Column({ type: 'boolean', default: false })
  is_deleted!: boolean;
}
