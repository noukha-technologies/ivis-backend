import { Column, CreateDateColumn, Entity, Index, UpdateDateColumn } from 'typeorm';
import { SnowflakePrimaryColumn } from './snowflake-id.column';

@Entity({ name: 'permissions', schema: 'core' })
export class Permission {
  @SnowflakePrimaryColumn()
  id!: string;

  @Column({ type: 'varchar', unique: true, nullable: false })
  @Index('IDX_PERMISSION_KEY', { unique: true })
  key!: string;

  @Column({ type: 'varchar', nullable: false })
  description!: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'varchar', nullable: true })
  created_by?: string;

  @CreateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  updated_at!: Date;

  @Column({ type: 'boolean', default: false })
  is_deleted!: boolean;
}
