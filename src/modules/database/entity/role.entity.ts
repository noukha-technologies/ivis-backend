import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  UpdateDateColumn,
} from 'typeorm';
import { bigintAsStringTransformer } from '../bigint-string.transformer';
import { SnowflakePrimaryColumn } from './snowflake-id.column';
import { Permission } from './permission.entity';

@Entity({ name: 'roles', schema: 'core' })
@Index('IDX_ROLE_ROLE_NAME', ['role_name'], { unique: true })
@Index('IDX_ROLE_PERMISSION_ID', ['permission_id'], { unique: true })
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


  @Column({ type: 'varchar', nullable: true })
  created_by?: string;

  @CreateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  updated_at!: Date;

  @Column({ type: 'boolean', default: false })
  is_deleted!: boolean;
}
