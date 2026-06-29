import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  OneToOne,
  UpdateDateColumn,
} from 'typeorm';
import { SnowflakePrimaryColumn } from './snowflake-id.column';
import { ICentreMasterFields } from '../../../common/interfaces/master.interface';

import { Line } from './line.entity';
import { User } from './user.entity';
@Entity({ name: 'centres', schema: 'master' })
export class Centre implements ICentreMasterFields {
  @SnowflakePrimaryColumn()
  id!: string;

  @Column({ type: 'integer', unique: true, nullable: false })
  @Index('IDX_CENTRE_CENTRE_ID', { unique: true })
  centre_id!: number;

  @Column({ type: 'varchar', nullable: false })
  name!: string;

  @Column({ type: 'varchar', unique: true, nullable: false })
  @Index('IDX_CENTRE_CODE', { unique: true })
  code!: string;

  @Column({ type: 'varchar', nullable: true })
  description?: string;

  @Column({ type: 'boolean', default: false })
  auto_submit!: boolean;

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

  @OneToMany(() => Line, (line) => line.centre)
  lines?: Line[];

  @OneToOne(() => User, (user) => user.assignedCentre)
  assignedUser?: User;
}
