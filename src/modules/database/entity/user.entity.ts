import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { DatabaseSchemas } from '../../../common/constants/database-schemas.js';
import { bigintAsStringTransformer } from '../bigint-string.transformer.js';

@Entity({ name: 'users', schema: DatabaseSchemas.CORE })
export class User {
  @PrimaryColumn({ type: 'bigint', transformer: bigintAsStringTransformer })
  id!: string;

  @Column({ type: 'integer', unique: true, nullable: false })
  @Index('IDX_USER_USER_ID', { unique: true })
  user_id!: number;

  @Column({ type: 'varchar', nullable: false })
  user_name!: string;

  @Column({ type: 'varchar', unique: true, nullable: false })
  @Index('IDX_USER_EMAIL', { unique: true })
  email!: string;

  @Column({ type: 'varchar', nullable: true, select: false })
  password_hash?: string;

  @Column({ type: 'varchar', nullable: false })
  role!: string;

  @Column({ type: 'varchar', nullable: true })
  center?: string;

  @Column({ type: 'varchar', nullable: true })
  line?: string;

  @CreateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  updated_at!: Date;

  @Column({ type: 'boolean', default: false })
  is_deleted!: boolean;
}
