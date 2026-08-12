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
import { bigintAsStringTransformer } from '../../../common/utils/bigint-string.transformer';
import { DATABASE_SCHEMAS } from '../../../common/constants/database-schemas';

import { Centre } from './centre.entity';
import { Appointment } from './appointment.entity';

/**
 * A booking as the appointment provider returned it — stored verbatim.
 *
 * This is the ingest landing table: the poller writes every booking it sees
 * here first, keyed by the provider's `booking_id`, then promotes it to a
 * local `Appointment`. Keeping the raw payload means a provider-side field we
 * do not map today is still recoverable later, and gives an audit trail of
 * exactly what we were told and when.
 *
 * Rows are never deleted when a booking disappears from the provider's day —
 * an operator may already have acted on it, so `is_withdrawn` records the
 * disappearance instead.
 */
@Entity({ name: 'appointment_bookings', schema: DATABASE_SCHEMAS.TRANSACTION })
@Index('IDX_APPT_BOOKING_BOOKING_ID', ['booking_id'], { unique: true })
@Index('IDX_APPT_BOOKING_CENTRE_DATE', ['centre_id', 'booking_date'])
@Index('IDX_APPT_BOOKING_PLATE', ['plate_number', 'plate_type'])
export class AppointmentBooking {
  @SnowflakePrimaryColumn()
  id!: string;

  /** The provider's booking number — globally unique, so it is our upsert key. */
  @Column({ type: 'varchar', length: 64, nullable: false })
  booking_id!: string;

  @Column({
    type: 'bigint',
    transformer: bigintAsStringTransformer,
    nullable: false,
  })
  centre_id!: string;

  @ManyToOne(() => Centre, { nullable: false })
  @JoinColumn({ name: 'centre_id' })
  centre?: Centre;

  /** Denormalised from the centre at ingest time, so the row stays readable
   *  even if the centre is later relinked to a different branch. */
  @Column({ type: 'varchar', length: 16, nullable: false })
  provider_branch_code!: string;

  /** Oman-local YYYY-MM-DD — the day this booking belongs to. */
  @Column({ type: 'date', nullable: false })
  booking_date!: string;

  /** Oman-local HH:mm. */
  @Column({ type: 'varchar', length: 8, nullable: true })
  booking_time?: string | null;

  /** Extracted from the payload so the ANPR lookup can match without parsing
   *  jsonb. A vehicle is the PAIR (plate_number, plate_type). */
  @Column({ type: 'varchar', length: 16, nullable: false })
  plate_number!: string;

  @Column({ type: 'varchar', length: 24, nullable: false })
  plate_type!: string;

  /** The provider's own lifecycle value: CONFIRMED / CHECKED_IN /
   *  IN_PROGRESS / COMPLETED. Deliberately kept separate from the local
   *  Appointment.status, which tracks the IVIS workflow. */
  @Column({ type: 'varchar', length: 24, nullable: false })
  provider_status!: string;

  /** The response object exactly as received. */
  @Column({ type: 'jsonb', nullable: false })
  payload!: Record<string, unknown>;

  /** The local appointment promoted from this booking; null until promotion
   *  succeeds, which makes the promote step safely re-runnable. */
  @Column({
    type: 'bigint',
    transformer: bigintAsStringTransformer,
    nullable: true,
  })
  appointment_id?: string | null;

  @ManyToOne(() => Appointment, { nullable: true })
  @JoinColumn({ name: 'appointment_id' })
  appointment?: Appointment;

  /** Set when the booking stops appearing in the provider's day — typically a
   *  cancellation. Not a delete: downstream work may already reference it. */
  @Column({ type: 'boolean', default: false, nullable: false })
  is_withdrawn!: boolean;

  @Column({ type: 'timestamp', nullable: false, default: () => 'NOW()' })
  first_seen_at!: Date;

  @Column({ type: 'timestamp', nullable: false, default: () => 'NOW()' })
  last_seen_at!: Date;

  @CreateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  updated_at!: Date;
}
