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
import { DATABASE_SCHEMAS } from '../../../common/enums/common.enums';
import { IVehicleMasterFields } from '../../../common/interfaces/master.interface';
import { bigintAsStringTransformer } from '../../../common/utils/bigint-string.transformer';
import { ChargeCategory } from './charge-category.entity';

@Entity({ name: 'vehicles', schema: DATABASE_SCHEMAS.MASTER })
@Index('IDX_VEHICLE_VEHICLE_ID', ['vehicle_id'], { unique: true })
@Index('IDX_VEHICLE_CODE', ['code'], { unique: true })
@Index('IDX_VEHICLE_VIN_NO', ['vin_no'], { unique: true })
export class Vehicle implements IVehicleMasterFields {
  @SnowflakePrimaryColumn()
  id!: string;

  @Column({ type: 'integer', unique: true, nullable: false })
  vehicle_id!: number;

  @Column({ type: 'varchar', nullable: false })
  name!: string;

  @Column({ type: 'varchar', nullable: false })
  code!: string;

  @Column({ type: 'varchar', nullable: true })
  vin_no?: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  vehicle_type?: string;

  @Column({
    type: 'bigint',
    transformer: bigintAsStringTransformer,
    nullable: true,
  })
  charge_category_id?: string | null;

  @ManyToOne(() => ChargeCategory, { nullable: true })
  @JoinColumn({ name: 'charge_category_id' })
  chargeCategory?: ChargeCategory;

  @Column({ type: 'varchar', default: 'Active', nullable: false })
  status!: string;

  @Column({ type: 'varchar', nullable: true })
  description?: string;

  @Column({ type: 'varchar', nullable: true })
  created_by?: string;

  @CreateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  updated_at!: Date;

  @Column({ type: 'boolean', default: false })
  is_deleted!: boolean;
}
