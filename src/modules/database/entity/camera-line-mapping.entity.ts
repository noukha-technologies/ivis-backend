import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  UpdateDateColumn,
} from 'typeorm';
import { bigintAsStringTransformer } from '../../../common/utils/bigint-string.transformer';
import { SnowflakePrimaryColumn } from './snowflake-id.column';
import { Camera } from './camera.entity';
import { Line } from './line.entity';

@Entity({ name: 'camera_line_mappings', schema: 'master' })
export class CameraLineMapping {
  @SnowflakePrimaryColumn()
  id!: string;

  @Column({
    type: 'bigint',
    transformer: bigintAsStringTransformer,
    nullable: false,
  })
  camera_id!: string;

  @ManyToOne(() => Camera, (camera) => camera.lineMappings, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'camera_id' })
  camera!: Camera;

  @Column({
    type: 'bigint',
    transformer: bigintAsStringTransformer,
    nullable: false,
  })
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
