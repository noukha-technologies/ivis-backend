import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  UpdateDateColumn,
} from 'typeorm';
import { bigintAsStringTransformer } from '../../../common/utils/bigint-string.transformer';
import { SnowflakePrimaryColumn } from './snowflake-id.column';
import { AnprCapture } from './anpr-capture.entity';

import { DATABASE_SCHEMAS } from '../../../common/constants/database-schemas';

@Entity({ name: 'rop_verifications', schema: DATABASE_SCHEMAS.TRANSACTION })
@Index('IDX_ROP_VERIFICATION_ROP_VERIFICATION_ID', ['rop_verification_id'], { unique: true })
@Index('IDX_ROP_VERIFICATION_ANPR_CAPTURE_ID', ['anpr_capture_id'])
@Index('IDX_ROP_VERIFICATION_FETCH_STATUS_CREATED_AT', ['fetch_status', 'created_at'])
export class RopVerification {
  @SnowflakePrimaryColumn()
  id!: string;

  @Column({ type: 'integer', unique: true, nullable: false })
  rop_verification_id!: number;

  @Column({ type: 'bigint', transformer: bigintAsStringTransformer, nullable: false })
  anpr_capture_id!: string;

  @ManyToOne(() => AnprCapture, (anprCapture) => anprCapture.rop_verifications, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'anpr_capture_id' })
  anpr_capture!: AnprCapture;

  @Column({ type: 'varchar', length: 128, nullable: true })
  owner_name?: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  vehicle_make?: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  vehicle_model?: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  reg_no?: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  chassis_no?: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  insurance?: string;

  @Column({ type: 'date', nullable: true })
  reg_expiry?: Date;

  @Column({ type: 'varchar', length: 32, default: 'Not Fetched', nullable: false })
  fetch_status!: string;

  @Column({ type: 'varchar', nullable: true })
  created_by?: string;

  @CreateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  updated_at!: Date;

  @Column({ type: 'boolean', default: false })
  is_deleted!: boolean;
}
