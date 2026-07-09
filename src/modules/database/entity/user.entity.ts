import {
  Entity,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  OneToMany,
  JoinColumn,
  BeforeInsert,
  BeforeUpdate,
} from 'typeorm';
import * as bcrypt from 'bcrypt';
import { SnowflakePrimaryColumn } from './snowflake-id.column';
import { bigintAsStringTransformer } from '../../../common/utils/bigint-string.transformer';

import { Role } from './role.entity';
import { Centre } from './centre.entity';
import { UserLineMapping } from './user-line-mapping.entity';
import { IUserFields } from '../../../common/interfaces/user.interface';
import { DATABASE_SCHEMAS } from 'src/common/constants/database-schemas';

@Entity({ name: 'users', schema: DATABASE_SCHEMAS.CORE })
@Index('IDX_USER_CENTER_ID', ['center_id'])
@Index('IDX_USER_ROLE_ID', ['role_id'])
@Index('IDX_USER_USER_CODE', ['user_code'], { unique: true })
@Index('IDX_USER_USER_ID', ['user_id'], { unique: true })
@Index('IDX_USER_EMAIL', ['email'], { unique: true })
export class User implements IUserFields {
  @SnowflakePrimaryColumn()
  id!: string;

  @Column({ type: 'integer', unique: true, nullable: false })
  user_id!: number;

  @Column({ type: 'varchar', unique: true, nullable: false })
  user_code!: string;

  @Column({ type: 'varchar', nullable: false })
  user_name!: string;

  @Column({ type: 'varchar', unique: true, nullable: false })
  email!: string;

  @Column({ name: 'password', type: 'varchar', nullable: true, select: false })
  password!: string;

  @Column({
    type: 'bigint',
    transformer: bigintAsStringTransformer,
    nullable: false,
  })
  role_id!: string;

  @ManyToOne(() => Role, { nullable: false })
  @JoinColumn({ name: 'role_id' })
  role!: Role;

  @Column({
    type: 'bigint',
    transformer: bigintAsStringTransformer,
    nullable: true,
  })
  center_id?: string | null;

  @ManyToOne(() => Centre, (centre) => centre.assignedUsers, { nullable: true })
  @JoinColumn({ name: 'center_id' })
  assignedCentre!: Centre;

  @OneToMany(() => UserLineMapping, (mapping) => mapping.user)
  lineMappings?: UserLineMapping[];

  @Column({ type: 'varchar', nullable: true })
  created_by?: string;

  @CreateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  updated_at!: Date;

  @Column({ type: 'boolean', default: false })
  is_deleted!: boolean;

  // True only for a Super Admin's re-scoped local copy (see Onboarding Sync /
  // ONBOARDING_DB_SYNC_ARCHITECTURE.md). On login, such a row is re-verified
  // against the central password when central is reachable (source of truth),
  // falling back to the local hash when it's not. Never set for organically
  // created local users or normally-synced Centre Admin rows.
  @Column({ type: 'boolean', default: false })
  requires_central_revalidation!: boolean;

  @BeforeInsert()
  @BeforeUpdate()
  async hashPassword(): Promise<void> {
    if (
      this.password &&
      !/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(this.password)
    ) {
      this.password = await bcrypt.hash(this.password, 10);
    }
  }
}
