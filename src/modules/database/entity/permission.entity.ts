import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  UpdateDateColumn,
} from 'typeorm';
import type { RoleAccessMatrix } from '../../../common/types/role-access.types';
import { SnowflakePrimaryColumn } from './snowflake-id.column';

@Entity({ name: 'permissions', schema: 'core' })
@Index('IDX_PERMISSION_PROFILE_NAME', ['name'], { unique: true })
export class Permission {
  @SnowflakePrimaryColumn()
  id!: string;

  @Column({ type: 'varchar', length: 128, nullable: false })
  name!: string;

  @Column({ type: 'jsonb', nullable: false, default: () => "'{}'" })
  access!: RoleAccessMatrix;

  @Column({ type: 'boolean', default: true })
  is_active!: boolean;

  @Column({ type: 'varchar', nullable: true })
  created_by?: string;

  @CreateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  updated_at!: Date;

  @Column({ type: 'boolean', default: false })
  is_deleted!: boolean;
}
