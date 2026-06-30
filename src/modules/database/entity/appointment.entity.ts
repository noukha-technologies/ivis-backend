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
  @Column({ type: 'bigint', transformer: bigintAsStringTransformer, nullable: true })
  anpr_capture_id?: string | null;

  @ManyToOne(() => AnprCapture, { nullable: true })
  @JoinColumn({ name: 'anpr_capture_id' })
  anprCapture?: AnprCapture;


  /* Customer FK */
  @Column({ type: 'bigint', transformer: bigintAsStringTransformer, nullable: true })
  customer_id?: string | null;

  @ManyToOne(() => Customer, { nullable: true })
  @JoinColumn({ name: 'customer_id' })
  customer?: Customer;


  /* Master Vehicle Record FK */
  @Column({ type: 'bigint', transformer: bigintAsStringTransformer, nullable: true })
  vehicle_record_id?: string | null;

  @ManyToOne(() => VehicleRecord, { nullable: true })
  @JoinColumn({ name: 'vehicle_record_id' })
  vehicleRecord?: VehicleRecord;


  /* Centre FK */
  @Column({ type: 'bigint', transformer: bigintAsStringTransformer, nullable: true })
  centre_id?: string | null;

  @ManyToOne(() => Centre, { nullable: true })
  @JoinColumn({ name: 'centre_id' })
  centre?: Centre;


  /* Line FK */
  @Column({ type: 'bigint', transformer: bigintAsStringTransformer, nullable: true })
  line_id?: string | null;

  @ManyToOne(() => Line, { nullable: true })
  @JoinColumn({ name: 'line_id' })
  line?: Line;


  @Column({ type: 'varchar', length: 16, default: 'Walk-in' })
  booking_type!: string;

  @Column({ type: 'timestamp', nullable: false })
  appointment_at!: Date;

  @Column({ type: 'varchar', length: 32, default: 'Scheduled', nullable: false })
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
