import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  UpdateDateColumn,
} from 'typeorm';
import { SnowflakePrimaryColumn } from './snowflake-id.column';
import { Line } from './line.entity';

@Entity({ name: 'cameras', schema: 'master' })
export class Camera {
  @SnowflakePrimaryColumn()
  id!: string;

  @Column({ type: 'integer', unique: true, nullable: false })
  @Index('IDX_CAMERA_CAMERA_ID', { unique: true })
  camera_id!: number;

  @Column({ type: 'varchar', nullable: false })
  name!: string;

  @Column({ type: 'varchar', unique: true, nullable: false })
  @Index('IDX_CAMERA_CODE', { unique: true })
  code!: string;

  @Column({ type: 'varchar', nullable: false })
  type!: string;

  @Column({ type: 'bigint' })
  @Index('UQ_CAMERA_LINE_ID', { unique: true, where: '"is_deleted" = false' })
  line_id!: string;

  @OneToOne(() => Line, (line) => line.camera, { nullable: false })
  @JoinColumn({ name: 'line_id' })
  line!: Line;

  @Column({ type: 'varchar', nullable: true })
  description?: string;

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
}
