import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  UpdateDateColumn,
} from 'typeorm';
import { bigintAsStringTransformer } from '../bigint-string.transformer';
import { SnowflakePrimaryColumn } from './snowflake-id.column';
import { DATABASE_SCHEMAS } from '../../../common/constants/database-schemas';
import { VehicleRecord } from './vehicle-record.entity';

@Entity({ name: 'customers', schema: DATABASE_SCHEMAS.TRANSACTION })
@Index('IDX_CUSTOMER_CUSTOMER_ID', ['customer_id'], { unique: true })
@Index('IDX_CUSTOMER_PHONE', ['phone'])
@Index('IDX_CUSTOMER_ID_NUMBER', ['id_number'])
@Index('IDX_CUSTOMER_PRIMARY_VEHICLE_RECORD_ID', ['primary_vehicle_record_id'])
export class Customer {
  @SnowflakePrimaryColumn()
  id!: string;

  @Column({ type: 'integer', unique: true, nullable: false })
  customer_id!: number;

  @Column({ type: 'varchar', length: 128, nullable: false })
  name!: string;

  @Column({ type: 'varchar', length: 32, nullable: false })
  phone!: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  owner_name?: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  id_number?: string;

  @Column({ type: 'bigint', transformer: bigintAsStringTransformer, nullable: true })
  primary_vehicle_record_id?: string | null;

  @ManyToOne(() => VehicleRecord, { nullable: true })
  @JoinColumn({ name: 'primary_vehicle_record_id' })
  primaryVehicleRecord?: VehicleRecord;

  @Column({ type: 'varchar', nullable: true })
  created_by?: string;

  @CreateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  updated_at!: Date;

  @Column({ type: 'boolean', default: false })
  is_deleted!: boolean;
}
