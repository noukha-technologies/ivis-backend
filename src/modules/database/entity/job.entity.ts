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
import { Charge } from './charge.entity';
import { JobImage } from './job-image.entity';
import { Payments } from './payments.entity';
import { User } from './user.entity';

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

  /** Manually-uploaded / camera-captured photos for this job (Test & Submit step). */
  @OneToMany(() => JobImage, (jobImage) => jobImage.job)
  images?: JobImage[];

  /**
   * Payments settled against this job.
   *
   * A collection rather than a single row because the FK already permits more
   * than one and history must stay readable — a cancelled payment followed by
   * a replacement is two rows, and hiding either would misreport what was
   * taken. In practice a job has one.
   *
   * Read-only from the job's side: payments are written by PaymentsService and
   * by the appointment ingest, never through this relation.
   */
  @OneToMany(() => Payments, (payment) => payment.job)
  payments?: Payments[];

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

  /**
   * The Charges-master row an operator mapped this job onto.
   *
   * Exists because the vehicle's own type is not always configured: a Sedan
   * arrives at a centre whose master only prices SUV, and the operator maps it
   * to the comparable configured type so the job can be priced at all. Held on
   * the JOB, not the vehicle record — it is a judgement about this visit, and
   * writing it back to the vehicle master would silently reprice every future
   * inspection of that plate.
   *
   * Null means "price it from the vehicle's own type", which is the normal
   * path. When set, it OVERRIDES that lookup and is what the amount is
   * computed from — so it is also the audit trail for why a job was charged
   * what it was.
   */
  @Column({
    type: 'bigint',
    transformer: bigintAsStringTransformer,
    nullable: true,
  })
  charge_id?: string | null;

  @ManyToOne(() => Charge, { nullable: true })
  @JoinColumn({ name: 'charge_id' })
  charge?: Charge;

  /* Assigned user FK — who is responsible for this job.
   *
   * Nullable only because jobs created before assignment existed have none;
   * JobService requires it on every new job, chosen from the users mapped to
   * the job's line. Assignment is fixed at creation and not reassignable here. */
  @Column({
    type: 'bigint',
    transformer: bigintAsStringTransformer,
    nullable: true,
  })
  assigned_user_id?: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'assigned_user_id' })
  assignedUser?: User;

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
