import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  UpdateDateColumn,
} from 'typeorm';
import { SnowflakePrimaryColumn } from './snowflake-id.column';
import { DATABASE_SCHEMAS } from '../../../common/enums/common.enums';

@Entity({ name: 'vehicles', schema: DATABASE_SCHEMAS.MASTER })
@Index('IDX_VEHICLE_VEHICLE_ID', ['vehicle_id'], { unique: true })
@Index('IDX_VEHICLE_CODE', ['code'], { unique: true })
@Index('IDX_VEHICLE_VIN_NO', ['vin_no'], { unique: true })
export class Vehicle {
  @SnowflakePrimaryColumn()
  id!: string;

  @Column({ type: 'integer', unique: true, nullable: false })
  vehicle_id!: number;

  @Column({ type: 'varchar', length: 128, nullable: false })
  name!: string;

  @Column({ type: 'varchar', length: 64, nullable: false })
  code!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  vin_no?: string;

  @Column({ type: 'varchar', length: 32, default: 'Active', nullable: false })
  status!: string;

  @Column({ type: 'varchar', nullable: true })
  created_by?: string;

  @CreateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  updated_at!: Date;

  @Column({ type: 'boolean', default: false })
  is_deleted!: boolean;
}
