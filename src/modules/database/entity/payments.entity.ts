import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  UpdateDateColumn,
} from 'typeorm';
import { DATABASE_SCHEMAS } from '../../../common/constants/database-schemas';
import { IPaymentsFields } from '../../../common/interfaces/transactions.interface';
import { PaymentStatusEnum, PaymentTypeEnum } from '../../../common/enums/payment.enums';

import { Job } from './job.entity';
import { Line } from './line.entity';
import { Camera } from './camera.entity';
import { Centre } from './centre.entity';
import { Customer } from './customer.entity';
import { Appointment } from './appointment.entity';
import { AnprCapture } from './anpr-capture.entity';
import { VehicleRecord } from './vehicle-record.entity';

import { SnowflakePrimaryColumn } from './snowflake-id.column';
import { bigintAsStringTransformer } from '../../../common/utils/bigint-string.transformer';

@Entity({ name: 'payments', schema: DATABASE_SCHEMAS.TRANSACTION })
@Index('IDX_PAYMENTS_ID', ['payment_id'], { unique: true })
@Index('IDX_PAYMENT_STATUS', ['status'])
@Index('IDX_PAYMENT_CUSTOMER_ID', ['customer_id'])
export class Payments implements IPaymentsFields {
  @SnowflakePrimaryColumn()
  id!: string;

  @Column({ type: 'integer', unique: true, nullable: false })
  payment_id!: number;

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
  camera_id?: string | null;

  @ManyToOne(() => Camera, { nullable: true })
  @JoinColumn({ name: 'camera_id' })
  camera?: Camera;

  @Column({ type: 'varchar', length: 16, nullable: false })
  payment_type_id!: PaymentTypeEnum;

  @Column({ type: 'varchar', length: 32, default: 'Paid', nullable: false })
  status!: PaymentStatusEnum;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  total_amount!: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  grand_total!: number;

  @Column({ type: 'timestamp', nullable: true })
  pay_date?: Date | null;

  @Column({ type: 'varchar', nullable: true })
  created_by?: string | null;

  @CreateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  updated_at!: Date;

  @Column({ type: 'boolean', default: false })
  is_deleted!: boolean;
}
