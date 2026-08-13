import {
  AfterLoad,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  JoinColumn,
  OneToMany,
  UpdateDateColumn,
} from 'typeorm';
import { SnowflakePrimaryColumn } from './snowflake-id.column';
import { AdminPcLineMapping } from './admin-pc-line-mapping.entity';
import { IAdminPcMasterFields } from '../../../common/interfaces/master.interface';
import { bigintAsStringTransformer } from '../../../common/utils/bigint-string.transformer';
import { Centre } from './centre.entity';

@Entity({ name: 'admin_pcs', schema: 'master' })
export class AdminPc implements IAdminPcMasterFields {
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

  /** Folder the generated IN file is written to (shared Admin PC IN folder). */
  @Column({ type: 'varchar', length: 512, nullable: true })
  in_file_path?: string;

  /** Folder watched for the Admin PC's OUT result files. */
  @Column({ type: 'varchar', length: 512, nullable: true })
  out_file_path?: string;

  @Column({
    type: 'bigint',
    transformer: bigintAsStringTransformer,
    nullable: true,
  })
  @Index('IDX_ADMIN_PC_CENTER_ID')
  center_id?: string | null;

  @ManyToOne(() => Centre, { nullable: true })
  @JoinColumn({ name: 'center_id' })
  centre?: Centre | null;

  @OneToMany(() => AdminPcLineMapping, (mapping) => mapping.adminPc)
  lineMappings?: AdminPcLineMapping[];

  line_ids?: string[];

  lines?: Array<{
    id: string;
    line_id: number;
    name: string;
    code: string;
    centre?: { id: string; centre_name: string; code: string };
  }>;

  @AfterLoad()
  populateLineFields(): void {
    const activeMappings = (this.lineMappings ?? []).filter(
      (mapping) => !mapping.is_deleted,
    );
    this.line_ids = activeMappings.map((mapping) => mapping.line_id);
    this.lines = activeMappings
      .map((mapping) => mapping.line)
      .filter((line): line is NonNullable<typeof line> => Boolean(line))
      .map((line) => ({
        id: line.id,
        line_id: line.line_id,
        name: line.name,
        code: line.code,
        centre: line.centre
          ? {
              id: line.centre.id,
              // Same key as every other centre payload — the frontend reads
              // centre_name everywhere.
              centre_name: line.centre.centre_name,
              code: line.centre.code,
            }
          : undefined,
      }));
    this.lineMappings = undefined;
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
