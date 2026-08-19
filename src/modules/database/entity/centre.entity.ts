import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  UpdateDateColumn,
} from 'typeorm';
import { Line } from './line.entity';
import { User } from './user.entity';
import { SnowflakePrimaryColumn } from './snowflake-id.column';
import { ICentreMasterFields } from '../../../common/interfaces/master.interface';

@Entity({ name: 'centres', schema: 'master' })
export class Centre implements ICentreMasterFields {
  @SnowflakePrimaryColumn()
  id!: string;

  @Column({ type: 'integer', unique: true, nullable: false })
  @Index('IDX_CENTRE_CENTRE_ID', { unique: true })
  centre_id!: number;

  @Column({ type: 'varchar', nullable: false })
  centre_name!: string;

  @Column({ type: 'varchar', unique: true, nullable: false })
  @Index('IDX_CENTRE_CODE', { unique: true })
  code!: string;

  @Column({ type: 'varchar', nullable: true })
  description?: string;

  @Column({ type: 'varchar', default: 'Active', nullable: false })
  status!: string;

  @OneToMany(() => Line, (line) => line.centre)
  lines?: Line[];

  @OneToMany(() => User, (user) => user.assignedCentre)
  assignedUsers?: User[];

  @Column({ type: 'varchar', nullable: true })
  provider_branch_code?: string | null;

  /**
   * This centre's own Database Sync credential, as issued by the central server
   * at onboarding. Only ever populated on the centre's own box, for its own
   * row — central keeps the bcrypt hash in `centre_api_keys` and leaves this
   * null.
   *
   * LOCAL ONLY. Listed in the Centre sync definition's `localOnlyColumns`, or
   * the pull phase would overwrite it with central's null on every run and the
   * centre would lock itself out after its first successful sync.
   */
  @Column({ type: 'varchar', nullable: true })
  sync_api_key?: string | null;

  @Column({ type: 'varchar', nullable: true })
  created_by?: string;

  @CreateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  updated_at!: Date;

  @Column({ type: 'boolean', default: false })
  is_deleted!: boolean;
}
