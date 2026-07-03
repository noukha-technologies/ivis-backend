import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  UpdateDateColumn,
} from 'typeorm';

import { SnowflakePrimaryColumn } from './snowflake-id.column';
import { bigintAsStringTransformer } from '../../../common/utils/bigint-string.transformer';
import { AccessScope, DEFAULT_ACCESS_SCOPE } from '../../../common/constants/access-scope';

import { Centre } from './centre.entity';
import { Permission } from './permission.entity';

@Entity({ name: 'roles', schema: 'core' })
@Index('IDX_ROLE_CENTER_ROLE_NAME', ['center_id', 'role_name'], { unique: true })
@Index('IDX_ROLE_PERMISSION_ID', ['permission_id'], { unique: true })
@Index('IDX_ROLE_CENTER_ID', ['center_id'])
export class Role {
  @SnowflakePrimaryColumn()
  id!: string;

  @Column({ type: 'integer', unique: true, nullable: false, generated: 'increment' })
  role_id!: number;

  @Column({ type: 'varchar', length: 64, nullable: false })
  role_name!: string;

  @Column({ type: 'bigint', transformer: bigintAsStringTransformer, nullable: false })
  permission_id!: string;

  @ManyToOne(() => Permission, { nullable: false })
  @JoinColumn({ name: 'permission_id' })
  permission!: Permission;

  @Column({ type: 'varchar', length: 512, nullable: true })
  description?: string;

  @Column({ type: 'varchar', length: 16, default: DEFAULT_ACCESS_SCOPE })
  access_scope!: AccessScope;

  @Column({ type: 'boolean', default: false })
  is_center_admin!: boolean;

  // Owning centre. NULL → global/system role (Super Admin); set → the role
  // belongs to that one centre. Consistent with access_scope: global ⇒ NULL,
  // centre ⇒ centre id.
  @Column({ type: 'bigint', transformer: bigintAsStringTransformer, nullable: true })
  center_id?: string | null;

  @ManyToOne(() => Centre, { nullable: true })
  @JoinColumn({ name: 'center_id' })
  centre?: Centre;


  @Column({ type: 'varchar', nullable: true })
  created_by?: string;

  @CreateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  updated_at!: Date;

  @Column({ type: 'boolean', default: false })
  is_deleted!: boolean;
}
