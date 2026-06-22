import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  UpdateDateColumn,
} from 'typeorm';
import { SnowflakePrimaryColumn } from './snowflake-id.column';
import { DATABASE_SCHEMAS } from '../../../common/enums/common.enums';
import { IPaymentTypeMasterFields } from '../../../common/interfaces/master.interface';

@Entity({ name: 'payment_types', schema: DATABASE_SCHEMAS.MASTER })
@Index('IDX_PT_PAYMENT_TYPE_ID', ['payment_type_id'], { unique: true })
@Index('IDX_PT_CODE', ['code'], { unique: true })
export class PaymentType implements IPaymentTypeMasterFields {
  @SnowflakePrimaryColumn()
  id!: string;

  @Column({ type: 'integer', unique: true, nullable: false })
  payment_type_id!: number;

  @Column({ type: 'varchar', length: 128, nullable: false })
  name!: string;

  @Column({ type: 'varchar', length: 64, unique: true, nullable: false })
  code!: string;

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
