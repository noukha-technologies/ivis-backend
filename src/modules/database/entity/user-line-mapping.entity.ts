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
import { User } from './user.entity';
import { Line } from './line.entity';

@Entity({ name: 'user_line_mappings', schema: 'core' })
@Index('IDX_USER_LINE_MAPPING_USER_ID', ['user_id'])
export class UserLineMapping {
  @SnowflakePrimaryColumn()
  id!: string;

  @Column({ type: 'bigint', transformer: bigintAsStringTransformer, nullable: false })
  user_id!: string;

  @ManyToOne(() => User, (user) => user.lineMappings, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'bigint', transformer: bigintAsStringTransformer, nullable: false })
  line_id!: string;

  @ManyToOne(() => Line, { nullable: false })
  @JoinColumn({ name: 'line_id' })
  line!: Line;

  @Column({ type: 'varchar', nullable: true })
  created_by?: string;

  @CreateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  updated_at!: Date;

  @Column({ type: 'boolean', default: false })
  is_deleted!: boolean;
}
