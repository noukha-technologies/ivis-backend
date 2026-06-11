import {
  AfterLoad,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  UpdateDateColumn,
} from 'typeorm';
import { SnowflakePrimaryColumn } from './snowflake-id.column';

@Entity({ name: 'payments', schema: 'master' })
export class Payment {
  @SnowflakePrimaryColumn()
  id!: string;

  @Column({ type: 'integer', unique: true, nullable: false })
  @Index('IDX_PAYMENT_PAYMENT_ID', { unique: true })
  payment_id!: number;

  @Column({ type: 'varchar', nullable: false })
  name!: string;

  @Column({ type: 'varchar', unique: true, nullable: false })
  @Index('IDX_PAYMENT_CODE', { unique: true })
  code!: string;

  @Column({ type: 'varchar', default: 'Active', nullable: false })
  status!: string;

  @Column({ type: 'varchar', name: 'customer_phone', nullable: true })
  customer_phone?: string | null;

  phoneNo?: string | null;

  @AfterLoad()
  populatePhoneNo() {
    this.phoneNo = this.customer_phone || this.code;
  }

  @Column({ type: 'varchar', nullable: true })
  created_by?: string;

  @CreateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  updated_at!: Date;

  @Column({ type: 'boolean', default: false })
  is_deleted!: boolean;
}

