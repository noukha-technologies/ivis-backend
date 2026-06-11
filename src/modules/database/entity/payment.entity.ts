import {
  AfterLoad,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  UpdateDateColumn,
} from 'typeorm';
import { bigintAsStringTransformer } from '../../../common/utils/bigint-string.transformer';
import { SnowflakePrimaryColumn } from './snowflake-id.column';
import { Customer } from './customer.entity';

@Entity({ name: 'payments', schema: 'master' })
@Index('IDX_PAYMENT_CUSTOMER_ID', ['customer_id'])
export class Payment {
  @SnowflakePrimaryColumn()
  id!: string;

  @Column({ type: 'integer', unique: true, nullable: false })
  @Index('IDX_PAYMENT_PAYMENT_ID', { unique: true })
  payment_id!: number;

  @Column({ type: 'bigint', transformer: bigintAsStringTransformer, nullable: true })
  customer_id?: string | null;

  @ManyToOne(() => Customer, { nullable: true })
  @JoinColumn({ name: 'customer_id' })
  customer?: Customer;

  name?: string;

  phoneNo?: string | null;

  @AfterLoad()
  populateCustomerFields(): void {
    if (this.customer) {
      this.name = this.customer.name;
      this.phoneNo = this.customer.phone;
    }
  }

  @Column({ type: 'varchar', unique: true, nullable: false })
  @Index('IDX_PAYMENT_CODE', { unique: true })
  code!: string;

  @Column({ type: 'varchar', default: 'Active', nullable: false })
  status!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  payment_mode?: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  type?: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0, nullable: false })
  amount!: number;

  @Column({ type: 'varchar', nullable: true })
  created_by?: string;

  @CreateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  updated_at!: Date;

  @Column({ type: 'boolean', default: false })
  is_deleted!: boolean;
}
