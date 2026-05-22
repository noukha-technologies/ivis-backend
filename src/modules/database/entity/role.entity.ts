import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { bigintAsStringTransformer } from '../bigint-string.transformer';

@Entity({ name: 'roles', schema: 'master' })
export class Role {
  @PrimaryColumn({ type: 'bigint', transformer: bigintAsStringTransformer })
  id!: string;

  @Column({ type: 'varchar', unique: true, nullable: false })
  @Index('IDX_ROLE_ROLE_NAME', { unique: true })
  role_name!: string;

  @Column({ type: 'varchar', nullable: true })
  description?: string;

  @CreateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  updated_at!: Date;

  @Column({ type: 'boolean', default: false })
  is_deleted!: boolean;
}
