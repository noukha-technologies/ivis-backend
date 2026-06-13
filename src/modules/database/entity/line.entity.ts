import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  UpdateDateColumn,
} from 'typeorm';
import { bigintAsStringTransformer } from '../../../common/utils/bigint-string.transformer';
import { SnowflakePrimaryColumn } from './snowflake-id.column';
import { Centre } from './centre.entity';
import { Camera } from './camera.entity';
import { AdminPcLineMapping } from './admin-pc-line-mapping.entity';
import { UserLineMapping } from './user-line-mapping.entity';

@Entity({ name: 'lines', schema: 'master' })
export class Line {
  @SnowflakePrimaryColumn()
  id!: string;

  @Column({ type: 'integer', unique: true, nullable: false })
  @Index('IDX_LINE_LINE_ID', { unique: true })
  line_id!: number;

  @Column({ type: 'varchar', nullable: false })
  name!: string;

  @Column({ type: 'varchar', unique: true, nullable: false })
  @Index('IDX_LINE_CODE', { unique: true })
  code!: string;

  @Column({ type: 'bigint', transformer: bigintAsStringTransformer, nullable: false })
  @Index('IDX_LINE_CENTRE_ID')
  centre_id!: string;

  @ManyToOne(() => Centre, { nullable: false })
  @JoinColumn({ name: 'centre_id' })
  centre!: Centre;

  @Column({ type: 'integer', default: 1, nullable: false })
  display_order!: number;

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

  @OneToMany(() => UserLineMapping, (mapping) => mapping.line)
  userMappings?: UserLineMapping[];

  @OneToOne(() => Camera, (camera) => camera.line)
  camera?: Camera;

  @OneToMany(() => AdminPcLineMapping, (mapping) => mapping.line)
  adminPcMappings?: AdminPcLineMapping[];
}
