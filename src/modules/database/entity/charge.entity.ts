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
import { bigintAsStringTransformer } from '../../../common/utils/bigint-string.transformer';

import { Centre } from './centre.entity';
import { ChargeCategory } from './charge-category.entity';

import { IChargeMasterFields } from '../../../common/interfaces/master.interface';

@Entity({ name: 'charges', schema: DATABASE_SCHEMAS.MASTER })
export class Charge implements IChargeMasterFields {
  @SnowflakePrimaryColumn()
  id!: string;

  @Column({ type: 'integer', unique: true, nullable: false })
  @Index('IDX_CHARGE_CHARGE_ID', { unique: true })
  charge_id!: number;

  @Column({
    type: 'bigint',
    transformer: bigintAsStringTransformer,
    nullable: true,
  })
  @Index('IDX_CHARGE_CENTRE_ID')
  centre_id?: string;

  @ManyToOne(() => Centre, { nullable: true })
  @JoinColumn({ name: 'centre_id' })
  centre?: Centre;

  // Free-text vehicle type entered by the operator (not a FK to the vehicle master).
  @Column({ type: 'varchar', length: 64, nullable: false, default: '' })
  vehicle_type!: string;

  @Column({
    type: 'bigint',
    transformer: bigintAsStringTransformer,
    nullable: true,
  })
  @Index('IDX_CHARGE_CATEGORY_ID')
  charge_category_id?: string;

  @ManyToOne(() => ChargeCategory, { nullable: true })
  @JoinColumn({ name: 'charge_category_id' })
  chargeCategory?: ChargeCategory;

  @Column({ type: 'varchar', nullable: true })
  category?: string;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 3,
    nullable: false,
    default: 0,
  })
  center_charges!: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 3,
    nullable: false,
    default: 0,
  })
  rop_charges!: number;

  // Moved from ChargeCategory.fees — this is now a per-Charge amount rather
  // than a fixed per-category fee, included in grand_total like center/rop.
  @Column({
    type: 'decimal',
    precision: 12,
    scale: 3,
    nullable: false,
    default: 0,
  })
  category_charges!: number;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: false,
    default: 0,
  })
  vat_percent!: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 3,
    nullable: false,
    default: 0,
  })
  grand_total!: number;

  @Column({ type: 'date', nullable: false })
  validate_to!: Date;

  @Column({ type: 'varchar', default: 'Active', nullable: false })
  status!: string;

  @Column({ type: 'boolean', default: true, nullable: false })
  is_enabled!: boolean;

  @Column({ type: 'varchar', nullable: true })
  created_by?: string;

  @CreateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  updated_at!: Date;

  @Column({ type: 'boolean', default: false })
  is_deleted!: boolean;
}
