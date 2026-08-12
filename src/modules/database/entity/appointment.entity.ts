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

import type { AppointmentStatus } from '../../../common/enums/common.enums';
import { DATABASE_SCHEMAS } from '../../../common/constants/database-schemas';
import { IAppointmentFields } from 'src/common/interfaces/transaction.interface';

import { Line } from './line.entity';
import { Centre } from './centre.entity';
import { Customer } from './customer.entity';
import { AnprCapture } from './anpr-capture.entity';
import { VehicleRecord } from './vehicle-record.entity';
import { RopVerification } from './rop-verification.entity';

@Entity({ name: 'appointments', schema: DATABASE_SCHEMAS.TRANSACTION })
@Index('IDX_APPOINTMENT_APPOINTMENT_ID', ['appointment_id'], { unique: true })
@Index('IDX_APPOINTMENT_CUSTOMER_ID', ['customer_id'])
@Index('IDX_APPOINTMENT_ANPR_CAPTURE_ID', ['anpr_capture_id'])
export class Appointment implements IAppointmentFields {
  @SnowflakePrimaryColumn()
  id!: string;

  @Column({ type: 'integer', unique: true, nullable: false })
  appointment_id!: number;

  /* ANPR FK */
  @Column({
    type: 'bigint',
    transformer: bigintAsStringTransformer,
    nullable: true,
  })
  anpr_capture_id?: string | null;

  @ManyToOne(() => AnprCapture, { nullable: true })
  @JoinColumn({ name: 'anpr_capture_id' })
  anprCapture?: AnprCapture;

  /* ROP Verification FK */
  @Column({
    type: 'bigint',
    transformer: bigintAsStringTransformer,
    nullable: true,
  })
  rop_verification_id?: string | null;

  @ManyToOne(() => RopVerification, { nullable: true })
  @JoinColumn({ name: 'rop_verification_id' })
  ropVerification?: RopVerification;

  /* Customer FK */
  @Column({
    type: 'bigint',
    transformer: bigintAsStringTransformer,
    nullable: true,
  })
  customer_id?: string | null;

  @ManyToOne(() => Customer, { nullable: true })
  @JoinColumn({ name: 'customer_id' })
  customer?: Customer;

  /* Master Vehicle Record FK */
  @Column({
    type: 'bigint',
    transformer: bigintAsStringTransformer,
    nullable: true,
  })
  vehicle_record_id?: string | null;

  @ManyToOne(() => VehicleRecord, { nullable: true })
  @JoinColumn({ name: 'vehicle_record_id' })
  vehicleRecord?: VehicleRecord;

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

  @Column({ type: 'varchar', length: 16, default: 'Walk-in' })
  booking_type!: string;

  /**
   * The provider's booking number, when this appointment came from an online
   * booking rather than a walk-in. Unique, so re-running the ingest promotes
   * each booking exactly once.
   */
  @Column({ type: 'varchar', length: 64, nullable: true })
  provider_booking_id?: string | null;

  /* ---- What the provider says about this booking ----
   * Snapshot of the provider's own view, kept separate from the IVIS columns
   * beside them: `status` is our workflow, `provider_status` is theirs, and
   * they move independently. No Payment row is created from these — a payment
   * belongs to a job, and none exists until the vehicle arrives — but job
   * creation reads them to confirm the inspection is already paid for.
   */
  @Column({ type: 'varchar', length: 24, nullable: true })
  provider_status?: string | null;

  /** PAID or FREE. FREE is a free re-inspection, which is equally "paid for". */
  @Column({ type: 'varchar', length: 16, nullable: true })
  provider_payment_status?: string | null;

  /** Decimal, three places — parsed as a string, never a float. */
  @Column({ type: 'numeric', precision: 10, scale: 3, nullable: true })
  provider_fee_amount?: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  provider_payment_method?: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  provider_payment_reference?: string | null;

  /** True when this is the free re-inspection of an earlier failure. */
  @Column({ type: 'boolean', default: false, nullable: false })
  is_reinspection!: boolean;

  /** The lane the provider assigned, if any — their id (L1), not our line. */
  @Column({ type: 'varchar', length: 16, nullable: true })
  assigned_lane?: string | null;

  /**
   * The plate this appointment is for, carried directly on the row.
   *
   * An ingested booking exists before the vehicle arrives, so it has no
   * vehicle_record yet — the ANPR lookup therefore cannot join through
   * vehicleRecord to find it. Storing the plate here is what makes the
   * local-first match possible.
   */
  @Column({ type: 'varchar', length: 16, nullable: true })
  plate_number?: string | null;

  @Column({ type: 'timestamp', nullable: false })
  appointment_at!: Date;

  @Column({
    type: 'varchar',
    length: 32,
    default: 'Scheduled',
    nullable: false,
  })
  status!: AppointmentStatus;

  @Column({ type: 'varchar', length: 512, nullable: true })
  notes?: string;

  @Column({ type: 'varchar', nullable: true })
  created_by?: string;

  @CreateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  updated_at!: Date;

  @Column({ type: 'boolean', default: false })
  is_deleted!: boolean;
}
