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
import { AdminPc } from './admin-pc.entity';
import { Line } from './line.entity';

@Entity({ name: 'admin_pc_line_mappings', schema: 'master' })
@Index('IDX_ADMIN_PC_LINE_MAPPING_ADMIN_PC_ID', ['admin_pc_id'])
export class AdminPcLineMapping {
  @SnowflakePrimaryColumn()
  id!: string;

  @Column({ type: 'bigint', transformer: bigintAsStringTransformer, nullable: false })
  admin_pc_id!: string;

  @ManyToOne(() => AdminPc, (adminPc) => adminPc.lineMappings, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'admin_pc_id' })
  adminPc!: AdminPc;

  @Column({ type: 'bigint', transformer: bigintAsStringTransformer, nullable: false })
  line_id!: string;

  @ManyToOne(() => Line, (line) => line.adminPcMappings, { nullable: false })
  @JoinColumn({ name: 'line_id' })
  line!: Line;

  /** Per-line IN folder (e.g. //192.168.10.10/Admin1/Line1/Infolder). */
  @Column({ type: 'varchar', length: 512, nullable: true })
  in_file_path?: string;

  /** Per-line OUT folder watched for result files. */
  @Column({ type: 'varchar', length: 512, nullable: true })
  out_file_path?: string;

  @Column({ type: 'varchar', nullable: true })
  created_by?: string;

  @CreateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  updated_at!: Date;

  @Column({ type: 'boolean', default: false })
  is_deleted!: boolean;
}
