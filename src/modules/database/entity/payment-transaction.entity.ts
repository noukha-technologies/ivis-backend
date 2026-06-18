import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  UpdateDateColumn,
} from 'typeorm';
import type { PaymentTransactionStatus } from '../../../common/enums/payment-transaction.enums';
import { bigintAsStringTransformer } from '../../../common/utils/bigint-string.transformer';
import { SnowflakePrimaryColumn } from './snowflake-id.column';
import { AdminPc } from './admin-pc.entity';
import { AnprCapture } from './anpr-capture.entity';
import { Appointment } from './appointment.entity';
import { Camera } from './camera.entity';
import { Centre } from './centre.entity';
import { Customer } from './customer.entity';
import { Job } from './job.entity';
import { Line } from './line.entity';
import { VehicleRecord } from './vehicle-record.entity';

import { DATABASE_SCHEMAS } from '../../../common/constants/database-schemas';

@Entity({ name: 'payment_transactions', schema: DATABASE_SCHEMAS.TRANSACTION })
@Index('IDX_PAYMENT_TRANSACTION_PAYMENT_TRANSACTION_ID', ['payment_transaction_id'], {
  unique: true,
})
@Index('IDX_PAYMENT_TRANSACTION_STATUS', ['status'])
@Index('IDX_PAYMENT_TRANSACTION_CUSTOMER_ID', ['customer_id'])
export class PaymentTransaction {
  @SnowflakePrimaryColumn()
  id!: string;

  @Column({ type: 'integer', unique: true, nullable: false })
  payment_transaction_id!: number;

  @Column({ type: 'bigint', transformer: bigintAsStringTransformer, nullable: true })
  appointment_id?: string | null;

  @ManyToOne(() => Appointment, { nullable: true })
  @JoinColumn({ name: 'appointment_id' })
  appointment?: Appointment;

  @Column({ type: 'bigint', transformer: bigintAsStringTransformer, nullable: false })
  customer_id!: string;

  @ManyToOne(() => Customer, { nullable: false })
  @JoinColumn({ name: 'customer_id' })
  customer!: Customer;

  @Column({ type: 'bigint', transformer: bigintAsStringTransformer, nullable: false })
  vehicle_record_id!: string;

  @ManyToOne(() => VehicleRecord, { nullable: false })
  @JoinColumn({ name: 'vehicle_record_id' })
  vehicleRecord!: VehicleRecord;

  @Column({ type: 'bigint', transformer: bigintAsStringTransformer, nullable: true })
  job_id?: string | null;

  @ManyToOne(() => Job, { nullable: true })
  @JoinColumn({ name: 'job_id' })
  job?: Job;

  @Column({ type: 'bigint', transformer: bigintAsStringTransformer, nullable: true })
  anpr_capture_id?: string | null;

  @ManyToOne(() => AnprCapture, { nullable: true })
  @JoinColumn({ name: 'anpr_capture_id' })
  anprCapture?: AnprCapture;

  @Column({ type: 'bigint', transformer: bigintAsStringTransformer, nullable: true })
  centre_id?: string | null;

  @ManyToOne(() => Centre, { nullable: true })
  @JoinColumn({ name: 'centre_id' })
  centre?: Centre;

  @Column({ type: 'bigint', transformer: bigintAsStringTransformer, nullable: true })
  line_id?: string | null;

  @ManyToOne(() => Line, { nullable: true })
  @JoinColumn({ name: 'line_id' })
  line?: Line;

  @Column({ type: 'bigint', transformer: bigintAsStringTransformer, nullable: true })
  admin_pc_id?: string | null;

  @ManyToOne(() => AdminPc, { nullable: true })
  @JoinColumn({ name: 'admin_pc_id' })
  adminPc?: AdminPc;

  @Column({ type: 'bigint', transformer: bigintAsStringTransformer, nullable: true })
  camera_id?: string | null;

  @ManyToOne(() => Camera, { nullable: true })
  @JoinColumn({ name: 'camera_id' })
  camera?: Camera;

  @Column({ type: 'varchar', length: 32, nullable: false })
  payment_type!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  payment_mode?: string | null;

  @Column({ type: 'varchar', length: 32, default: 'Pending', nullable: false })
  status!: PaymentTransactionStatus;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  charges!: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  vat!: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  grand_total!: number;

  @Column({ type: 'timestamp', nullable: true })
  pay_date?: Date;

  @Column({ type: 'varchar', length: 512, nullable: true })
  capture_image_path?: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  attachment_path?: string | null;

  @Column({ type: 'varchar', length: 256, nullable: true })
  attachment_filename?: string | null;

  @Column({ type: 'varchar', nullable: true })
  created_by?: string;

  @CreateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  updated_at!: Date;

  @Column({ type: 'boolean', default: false })
  is_deleted!: boolean;
}
