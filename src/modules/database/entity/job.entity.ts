import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  UpdateDateColumn,
} from 'typeorm';

import { SnowflakePrimaryColumn } from './snowflake-id.column';
import { bigintAsStringTransformer } from '../../../common/utils/bigint-string.transformer';

import { IJobFields } from 'src/common/interfaces/job.interface';
import { DATABASE_SCHEMAS } from '../../../common/constants/database-schemas';
import type {
  JobOverallResult,
  JobStatus,
} from '../../../common/enums/job.enums';

import { Line } from './line.entity';
import { Centre } from './centre.entity';
import { Camera } from './camera.entity';
import { AdminPc } from './admin-pc.entity';
import { Customer } from './customer.entity';
import { Appointment } from './appointment.entity';
import { AnprCapture } from './anpr-capture.entity';
import { VehicleRecord } from './vehicle-record.entity';

@Entity({ name: 'jobs', schema: DATABASE_SCHEMAS.TRANSACTION })
@Index('IDX_JOB_JOB_ID', ['job_id'], { unique: true })
@Index('IDX_JOB_STATUS_CREATED_AT', ['status', 'created_at'])
@Index('IDX_JOB_CUSTOMER_ID', ['customer_id'])
@Index('IDX_JOB_APPOINTMENT_ID', ['appointment_id'])
@Index('IDX_JOB_VEHICLE_RECORD_ID', ['vehicle_record_id'])
@Index('IDX_JOB_CENTRE_LINE', ['centre_id', 'line_id'])
export class Job implements IJobFields {
  @SnowflakePrimaryColumn()
  id!: string;

  @Column({ type: 'integer', unique: true, nullable: false })
  job_id!: number;

  @Column({ type: 'varchar', length: 32, default: 'Pending', nullable: false })
  status!: JobStatus;

  /* Appointment FK */
  @Column({
    type: 'bigint',
    transformer: bigintAsStringTransformer,
    nullable: true,
  })
  appointment_id?: string | null;

  @ManyToOne(() => Appointment, { nullable: true })
  @JoinColumn({ name: 'appointment_id' })
  appointment?: Appointment;

  /* Customer FK */
  @Column({
    type: 'bigint',
    transformer: bigintAsStringTransformer,
    nullable: false,
  })
  customer_id!: string;

  @ManyToOne(() => Customer, { nullable: false })
  @JoinColumn({ name: 'customer_id' })
  customer!: Customer;

  /* VehicleRecord FK */
  @Column({
    type: 'bigint',
    transformer: bigintAsStringTransformer,
    nullable: false,
  })
  vehicle_record_id!: string;

  @ManyToOne(() => VehicleRecord, { nullable: false })
  @JoinColumn({ name: 'vehicle_record_id' })
  vehicleRecord!: VehicleRecord;

  /* Anpr-Capture FKs */
  @Column({
    type: 'bigint',
    transformer: bigintAsStringTransformer,
    nullable: true,
  })
  anpr_capture_id?: string | null;

  @ManyToOne(() => AnprCapture, { nullable: true })
  @JoinColumn({ name: 'anpr_capture_id' })
  anprCapture?: AnprCapture;

  /* Centre FK */
  @Column({
    type: 'bigint',
    transformer: bigintAsStringTransformer,
    nullable: true,
  })
  centre_id?: string | null;

  @ManyToOne(() => Centre, { nullable: true })
  @JoinColumn({ name: 'centre_id' })
  centre?: Centre;

  /* Line FK */
  @Column({
    type: 'bigint',
    transformer: bigintAsStringTransformer,
    nullable: true,
  })
  line_id?: string | null;

  @ManyToOne(() => Line, { nullable: true })
  @JoinColumn({ name: 'line_id' })
  line?: Line;

  /* Admin PC FK */
  @Column({
    type: 'bigint',
    transformer: bigintAsStringTransformer,
    nullable: true,
  })
  admin_pc_id?: string | null;

  @ManyToOne(() => AdminPc, { nullable: true })
  @JoinColumn({ name: 'admin_pc_id' })
  adminPc?: AdminPc;

  /* Camera FK */
  @Column({
    type: 'bigint',
    transformer: bigintAsStringTransformer,
    nullable: true,
  })
  camera_id?: string | null;

  @ManyToOne(() => Camera, { nullable: true })
  @JoinColumn({ name: 'camera_id' })
  camera?: Camera;

  /** Invoice identifiers (set when the job reaches the Invoice stage). */
  @Column({ type: 'varchar', length: 64, nullable: true })
  invoice_no?: string;

  @Column({ type: 'timestamp', nullable: true })
  invoice_date?: Date;

  /** Raw parsed OUT-file sections (for the Test & Submit display). */
  @Column({ type: 'jsonb', nullable: true })
  test_results?: Record<string, unknown> | null;

  /** Derived from OUT file — not stored per-test in DB */
  @Column({ type: 'varchar', length: 16, nullable: true })
  overall_result?: JobOverallResult | null;

  @Column({ type: 'varchar', length: 256, nullable: true })
  infile_name?: string;

  @Column({ type: 'varchar', length: 512, nullable: true })
  infile_path?: string;

  @Column({ type: 'varchar', length: 256, nullable: true })
  outfile_name?: string;

  @Column({ type: 'varchar', length: 512, nullable: true })
  outfile_path?: string;

  @Column({ type: 'timestamp', nullable: true })
  started_at?: Date;

  @Column({ type: 'timestamp', nullable: true })
  completed_at?: Date;

  @Column({ type: 'varchar', nullable: true })
  created_by?: string;

  @CreateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  updated_at!: Date;

  @Column({ type: 'boolean', default: false })
  is_deleted!: boolean;
}
