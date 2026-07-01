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
import { DATABASE_SCHEMAS } from '../../../common/constants/database-schemas';
import { bigintAsStringTransformer } from '../../../common/utils/bigint-string.transformer';

import { VehicleRecord } from './vehicle-record.entity';
import { ICustomerFields } from 'src/common/interfaces/transaction.interface';

@Entity({ name: 'customers', schema: DATABASE_SCHEMAS.TRANSACTION })
@Index('IDX_CUSTOMER_CUSTOMER_ID', ['customer_id'], { unique: true })
@Index('IDX_CUSTOMER_PHONE', ['customer_phone_number'])
@Index('IDX_CUSTOMER_ID_NUMBER', ['id_number'])
@Index('IDX_CUSTOMER_VEHICLE_RECORD_ID', ['vehicle_record_id'])
@Index('IDX_CUSTOMER_CHASSIS_NO', ['chassis_no'])
@Index('IDX_CUSTOMER_MULKIYA_ID', ['mulkiya_id'])
export class Customer implements ICustomerFields {
  @SnowflakePrimaryColumn()
  id!: string;

  @Column({ type: 'integer', unique: true, nullable: false })
  customer_id!: number;

  @Column({ type: 'varchar', length: 64, nullable: true })
  id_number?: string;


  @Column({ type: 'varchar', length: 128, nullable: false })
  customer_name!: string;

  @Column({ type: 'varchar', length: 32, nullable: false })
  customer_phone_number!: string;



  @Column({ type: 'varchar', length: 128, nullable: true })
  owner_name?: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  owner_phone_number?: string;


  @Column({ type: 'varchar', length: 32, nullable: true })
  plate_number?: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  chassis_no?: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  mulkiya_id?: string;



  @Column({ type: 'bigint', transformer: bigintAsStringTransformer, nullable: true })
  vehicle_record_id?: string | null;

  @ManyToOne(() => VehicleRecord, { nullable: true })
  @JoinColumn({ name: 'vehicle_record_id' })
  vehicleRecord?: VehicleRecord;



  @Column({ type: 'varchar', nullable: true })
  created_by?: string;

  @CreateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  updated_at!: Date;

  @Column({ type: 'boolean', default: false })
  is_deleted!: boolean;
}
