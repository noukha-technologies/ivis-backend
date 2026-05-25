import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  UpdateDateColumn,
} from 'typeorm';
import { SnowflakePrimaryColumn } from './snowflake-id.column';

@Entity({ name: 'vehicles', schema: 'master' })
export class Vehicle {
  @SnowflakePrimaryColumn()
  id!: string;

  @Column({ type: 'integer', unique: true, nullable: false })
  @Index('IDX_VEHICLE_VEHICLE_ID', { unique: true })
  vehicle_id!: number;

  @Column({ type: 'varchar', nullable: false })
  plate_number!: string;

  @Column({ type: 'varchar', nullable: false })
  vehicle_type!: string;

  @Column({ type: 'varchar', nullable: false })
  vehicle_color!: string;

  @Column({ type: 'varchar', nullable: false })
  vehicle_brand!: string;

  @Column({ type: 'varchar', nullable: true })
  created_by?: string;

  @CreateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  updated_at!: Date;

  @Column({ type: 'boolean', default: false })
  is_deleted!: boolean;
}
