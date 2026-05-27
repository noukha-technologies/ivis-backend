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
import { Line } from './line.entity';

@Entity({ name: 'admin_pcs', schema: 'master' })
export class AdminPc {
  @SnowflakePrimaryColumn()
  id!: string;

  @Column({ type: 'integer', unique: true, nullable: false })
  @Index('IDX_ADMIN_PC_ADMIN_PC_ID', { unique: true })
  admin_pc_id!: number;

  @Column({ type: 'varchar', nullable: false })
  name!: string;

  @Column({ type: 'varchar', unique: true, nullable: false })
  @Index('IDX_ADMIN_PC_CODE', { unique: true })
  code!: string;

  @Column({ type: 'varchar', nullable: false })
  ip_address!: string;

  @Column({ type: 'bigint' })
  line_id!: string;

  @ManyToOne(() => Line, { nullable: false })
  @JoinColumn({ name: 'line_id' })
  line!: Line;

  @Column({ type: 'varchar', nullable: true })
  description?: string;

  @Column({ type: 'varchar', default: 'Active', nullable: false })
  status!: string;

  @Column({ type: 'varchar', nullable: true })
  created_by?: string;

  @CreateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  updated_at!: Date;

  @Column({ type: 'boolean', default: false })
  is_deleted!: boolean;
}
