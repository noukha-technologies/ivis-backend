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
import { Vehicle } from './vehicle.entity';

import { DATABASE_SCHEMAS } from '../../../common/constants/database-schemas';

@Entity({ name: 'vehicle_records', schema: DATABASE_SCHEMAS.TRANSACTION })
@Index('IDX_VEHICLE_RECORD_VEHICLE_RECORD_ID', ['vehicle_record_id'], { unique: true })
@Index('IDX_VEHICLE_RECORD_PLATE_NUMBER', ['plate_number'], { unique: true })
@Index('IDX_VEHICLE_RECORD_CHASSIS_NO', ['chassis_no'])
@Index('IDX_VEHICLE_RECORD_VEHICLE_MASTER_ID', ['vehicle_master_id'])
export class VehicleRecord {
  @SnowflakePrimaryColumn()
  id!: string;

  @Column({ type: 'integer', unique: true, nullable: false })
  vehicle_record_id!: number;

  @Column({ type: 'varchar', length: 32, nullable: false })
  plate_number!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  chassis_no?: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  vehicle_make?: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  vehicle_model?: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  vehicle_type?: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  plate_color?: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  vehicle_color?: string;

  @Column({ type: 'bigint', transformer: bigintAsStringTransformer, nullable: true })
  vehicle_master_id?: string | null;

  @ManyToOne(() => Vehicle, { nullable: true })
  @JoinColumn({ name: 'vehicle_master_id' })
  vehicleMaster?: Vehicle;

  @Column({ type: 'varchar', nullable: true })
  created_by?: string;

  @CreateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  updated_at!: Date;

  @Column({ type: 'boolean', default: false })
  is_deleted!: boolean;
}
