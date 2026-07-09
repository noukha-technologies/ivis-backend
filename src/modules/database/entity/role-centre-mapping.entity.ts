import {
  Entity,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { bigintAsStringTransformer } from '../../../common/utils/bigint-string.transformer';
import { SnowflakePrimaryColumn } from './snowflake-id.column';
import { Role } from './role.entity';
import { Centre } from './centre.entity';

@Entity({ name: 'role_centre_mappings', schema: 'core' })
@Index('IDX_ROLE_CENTRE_MAPPING_ROLE_ID', ['role_id'])
@Index('IDX_ROLE_CENTRE_MAPPING_CENTRE_ID', ['centre_id'])
export class RoleCentreMapping {
  @SnowflakePrimaryColumn()
  id!: string;

  @Column({
    type: 'bigint',
    transformer: bigintAsStringTransformer,
    nullable: false,
  })
  role_id!: string;

  @ManyToOne(() => Role, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'role_id' })
  role!: Role;

  @Column({
    type: 'bigint',
    transformer: bigintAsStringTransformer,
    nullable: false,
  })
  centre_id!: string;

  @ManyToOne(() => Centre, { nullable: false })
  @JoinColumn({ name: 'centre_id' })
  centre!: Centre;

  @Column({ type: 'varchar', nullable: true })
  created_by?: string;

  @CreateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  updated_at!: Date;

  @Column({ type: 'boolean', default: false })
  is_deleted!: boolean;
}
