import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  UpdateDateColumn,
} from 'typeorm';

import { SnowflakePrimaryColumn } from './snowflake-id.column';
import { DATABASE_SCHEMAS } from '../../../common/constants/database-schemas';
import { bigintAsStringTransformer } from '../../../common/utils/bigint-string.transformer';

import { Camera } from './camera.entity';
import { RopVerification } from './rop-verification.entity';
import { IAnprCaptureFields } from 'src/common/interfaces/payments.interface';

@Entity({ name: 'anpr_captures', schema: DATABASE_SCHEMAS.TRANSACTION })
@Index('IDX_ANPR_CAPTURE_ANPR_CAPTURE_ID', ['anpr_capture_id'], { unique: true })
@Index('IDX_ANPR_CAPTURE_PLATE_TIME', ['plate_number', 'capture_time'])
@Index('IDX_ANPR_CAPTURE_CAMERA_TIME', ['camera_id', 'capture_time'])
@Index('UQ_ANPR_CAPTURE_CAMERA_PLATE_TIME', ['camera_id', 'plate_number', 'capture_time'], { unique: true })
export class AnprCapture implements IAnprCaptureFields {
  @SnowflakePrimaryColumn()
  id!: string;

  @Column({ type: 'integer', unique: true, nullable: false })
  anpr_capture_id!: number;

  @Column({ type: 'varchar', length: 32, nullable: false })
  plate_number!: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  normalized_plate?: string;

  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true })
  plate_confidence?: number;

  @Column({ type: 'timestamp', nullable: false })
  capture_time!: Date;

  @Column({ type: 'bigint', transformer: bigintAsStringTransformer, nullable: false })
  camera_id!: string;

  @ManyToOne(() => Camera, { nullable: false })
  @JoinColumn({ name: 'camera_id' })
  camera!: Camera;

  @Column({ type: 'varchar', length: 32, nullable: true })
  line_id?: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  direction?: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  plate_color?: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  vehicle_type?: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  vehicle_color?: string;

  @Column({ type: 'varchar', nullable: true })
  image_url?: string;

  @Column({ type: 'jsonb', nullable: true })
  raw_payload?: Record<string, unknown>;

  @OneToMany(() => RopVerification, (ropVerification) => ropVerification.anpr_capture)
  rop_verifications?: RopVerification[];

  @Column({ type: 'varchar', nullable: true })
  created_by?: string;

  @CreateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  updated_at!: Date;

  @Column({ type: 'boolean', default: false })
  is_deleted!: boolean;
}
