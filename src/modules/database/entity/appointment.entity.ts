import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  UpdateDateColumn,
} from 'typeorm';
import type { AppointmentStatus } from '../../../common/enums/appointment.enums';
import { bigintAsStringTransformer } from '../../../common/utils/bigint-string.transformer';
import { SnowflakePrimaryColumn } from './snowflake-id.column';
import { AnprCapture } from './anpr-capture.entity';
import { Centre } from './centre.entity';
import { Customer } from './customer.entity';
import { Line } from './line.entity';
import { VehicleRecord } from './vehicle-record.entity';

import { DATABASE_SCHEMAS } from '../../../common/constants/database-schemas';

@Entity({ name: 'appointments', schema: DATABASE_SCHEMAS.TRANSACTION })
@Index('IDX_APPOINTMENT_APPOINTMENT_ID', ['appointment_id'], { unique: true })
@Index('IDX_APPOINTMENT_CUSTOMER_ID', ['customer_id'])
@Index('IDX_APPOINTMENT_ANPR_CAPTURE_ID', ['anpr_capture_id'])
export class Appointment {
  @SnowflakePrimaryColumn()
  id!: string;

  @Column({ type: 'integer', unique: true, nullable: false })
  appointment_id!: number;

  @Column({ type: 'bigint', transformer: bigintAsStringTransformer, nullable: true })
  anpr_capture_id?: string | null;

  @ManyToOne(() => AnprCapture, { nullable: true })
  @JoinColumn({ name: 'anpr_capture_id' })
  anprCapture?: AnprCapture;

  @Column({ type: 'bigint', transformer: bigintAsStringTransformer, nullable: true })
  customer_id?: string | null;

  @ManyToOne(() => Customer, { nullable: true })
  @JoinColumn({ name: 'customer_id' })
  customer?: Customer;

  @Column({ type: 'bigint', transformer: bigintAsStringTransformer, nullable: true })
  vehicle_record_id?: string | null;

  @ManyToOne(() => VehicleRecord, { nullable: true })
  @JoinColumn({ name: 'vehicle_record_id' })
  vehicleRecord?: VehicleRecord;

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

  @Column({ type: 'varchar', length: 32, nullable: true })
  plate_number?: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  customer_name?: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  customer_phone?: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  id_number?: string;

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
