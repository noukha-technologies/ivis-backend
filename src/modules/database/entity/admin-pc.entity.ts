import {
  AfterLoad,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  UpdateDateColumn,
} from 'typeorm';
import { SnowflakePrimaryColumn } from './snowflake-id.column';
import { AdminPcLineMapping } from './admin-pc-line-mapping.entity';

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

  @OneToMany(() => AdminPcLineMapping, (mapping) => mapping.adminPc)
  lineMappings?: AdminPcLineMapping[];

  line_ids?: string[];

  lines?: Array<{
    id: string;
    line_id: number;
    name: string;
    code: string;
  }>;

  @AfterLoad()
  populateLineFields(): void {
    const activeMappings = (this.lineMappings ?? []).filter((mapping) => !mapping.is_deleted);
    this.line_ids = activeMappings.map((mapping) => mapping.line_id);
    this.lines = activeMappings
      .map((mapping) => mapping.line)
      .filter((line): line is NonNullable<typeof line> => Boolean(line))
      .map((line) => ({
        id: line.id,
        line_id: line.line_id,
        name: line.name,
        code: line.code,
      }));
  }

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
