import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  UpdateDateColumn,
} from 'typeorm';
import { SnowflakePrimaryColumn } from './snowflake-id.column';
import { DATABASE_SCHEMAS } from '../../../common/enums/common.enums';
import { IChargeCategoryMasterFields } from '../../../common/interfaces/master.interface';

@Entity({ name: 'charge_categories', schema: DATABASE_SCHEMAS.MASTER })
@Index('IDX_CC_CATEGORY_ID', ['category_id'], { unique: true })
export class ChargeCategory implements IChargeCategoryMasterFields {
  @SnowflakePrimaryColumn()
  id!: string;

  @Column({ type: 'integer', unique: true, nullable: false })
  category_id!: number;

  @Column({ type: 'varchar', length: 128, nullable: false })
  vehicle_weight!: string;

  @Column({ type: 'varchar', length: 128, nullable: false })
  engine_capacity!: string;

  @Column({ type: 'decimal', precision: 12, scale: 3, nullable: false, default: 0 })
  fees!: number;

  @Column({ type: 'varchar', default: 'Active', nullable: false })
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
