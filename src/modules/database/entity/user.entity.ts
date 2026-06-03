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

import { bigintAsStringTransformer } from '../bigint-string.transformer';
import { SnowflakePrimaryColumn } from './snowflake-id.column';
import { Centre } from './centre.entity';
import { Role } from './role.entity';
import { UserLineMapping } from './user-line-mapping.entity';

@Entity({ name: 'users', schema: 'core' })
export class User {
  @SnowflakePrimaryColumn()
  id!: string;

  @Column({ type: 'integer', unique: true, nullable: false })
  @Index('IDX_USER_USER_ID', { unique: true })
  user_id!: number;

  @Column({ type: 'varchar', unique: true, nullable: false })
  @Index('IDX_USER_USER_CODE', { unique: true })
  user_code!: string;

  @Column({ type: 'varchar', nullable: false })
  user_name!: string;

  @Column({ type: 'varchar', unique: true, nullable: false })
  @Index('IDX_USER_EMAIL', { unique: true })
  email!: string;

  @Column({ name: 'password', type: 'varchar', nullable: true, select: false })
  password!: string;

  @Column({ type: 'bigint', transformer: bigintAsStringTransformer, nullable: false })
  @Index('IDX_USER_ROLE_ID')
  role_id!: string;

  @ManyToOne(() => Role, { nullable: false })
  @JoinColumn({ name: 'role_id' })
  role!: Role;

  @Column({ type: 'bigint', transformer: bigintAsStringTransformer, nullable: true })
  center_id?: string | null;

  @ManyToOne(() => Centre, { nullable: true })
  @JoinColumn({ name: 'center_id' })
  assignedCentre?: Centre;

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

  @BeforeInsert()
  @BeforeUpdate()
  async hashPassword(): Promise<void> {
    if (this.password && !/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(this.password)) {
      this.password = await bcrypt.hash(this.password, 10);
    }
  }
}
