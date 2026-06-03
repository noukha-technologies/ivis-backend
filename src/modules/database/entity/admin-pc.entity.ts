import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  UpdateDateColumn,
} from 'typeorm';
import { bigintAsStringTransformer } from '../../../common/utils/bigint-string.transformer';
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

  @Column({ type: 'bigint', transformer: bigintAsStringTransformer, nullable: false })
  @Index('UQ_ADMIN_PC_LINE_ID', { unique: true, where: '"is_deleted" = false' })
  line_id!: string;

  @OneToOne(() => Line, (line) => line.adminPc, { nullable: false })
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
