import {
  Entity,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { bigintAsStringTransformer } from '../bigint-string.transformer';
import { SnowflakePrimaryColumn } from './snowflake-id.column';
import { Centre } from './centre.entity';
import { Line } from './line.entity';

@Entity({ name: 'users', schema: 'core' })
export class User {
  @SnowflakePrimaryColumn()
  id!: string;

  @Column({ type: 'integer', unique: true, nullable: false })
  @Index('IDX_USER_USER_ID', { unique: true })
  user_id!: number;

  @Column({ type: 'varchar', nullable: false })
  user_name!: string;

  @Column({ type: 'varchar', unique: true, nullable: false })
  @Index('IDX_USER_EMAIL', { unique: true })
  email!: string;

  @Column({ name: 'password', type: 'varchar', nullable: true, select: false })
  password!: string;

  @Column({ type: 'varchar', length: 64, nullable: false })
  @Index('IDX_USER_ROLE_NAME')
  role_name!: string;

  @Column({ type: 'bigint', transformer: bigintAsStringTransformer, nullable: true })
  center_id?: string | null;

  @ManyToOne(() => Centre, { nullable: true })
  @JoinColumn({ name: 'center_id' })
  assignedCentre?: Centre;

  @Column({ type: 'bigint', transformer: bigintAsStringTransformer, nullable: true })
  line_id?: string | null;

  @ManyToOne(() => Line, { nullable: true })
  @JoinColumn({ name: 'line_id' })
  assignedLine?: Line;

  @Column({ type: 'varchar', nullable: true })
  created_by?: string;

  @CreateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  updated_at!: Date;

  @Column({ type: 'boolean', default: false })
  is_deleted!: boolean;
}
