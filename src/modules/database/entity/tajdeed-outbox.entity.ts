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
import type {
  TajdeedDeliveryStatus,
  TajdeedEventStatus,
  TajdeedEventType,
} from '../../../common/enums/common.enums';

import { Job } from './job.entity';
import { Centre } from './centre.entity';
import { Line } from './line.entity';

/**
 * Durable queue of events owed to the appointment provider (Tajdeed VIS).
 *
 * This table exists because `POST /events` returns 202 meaning *queued*, not
 * *applied*, and a transaction_id is accepted exactly once. A fire-and-forget
 * call from the submit path would therefore lose the event outright if the
 * process died between completing the job and the provider accepting it, with
 * nothing anywhere recording that it was owed.
 *
 * So the event is written here FIRST, transaction_id and all, and a worker
 * drains it. The id is persisted before the first send precisely so a retry
 * can reuse it — that is what makes the retry safe rather than a duplicate.
 *
 * Two status columns, deliberately:
 *   • delivery_status — ours: did it reach them, and may we try again?
 *   • event_status    — theirs: did their worker apply it?
 * A row can be Accepted + FAILED. Collapsing the two would hide exactly the
 * case that needs a human.
 */
@Entity({ name: 'tajdeed_outbox', schema: DATABASE_SCHEMAS.TRANSACTION })
@Index('IDX_TAJDEED_OUTBOX_TRANSACTION_ID', ['transaction_id'], {
  unique: true,
})
@Index('IDX_TAJDEED_OUTBOX_DRAIN', ['delivery_status', 'next_attempt_at'])
@Index('IDX_TAJDEED_OUTBOX_JOB_ID', ['job_id'])
export class TajdeedOutbox {
  @SnowflakePrimaryColumn()
  id!: string;

  /**
   * UUID v4, generated and saved before the first send. Reused verbatim on
   * every retry of the same logical event; a NEW one is minted only when a
   * FAILED event is deliberately re-pushed, since the provider will never
   * move a failed transaction to processed.
   */
  @Column({ type: 'varchar', length: 64, nullable: false })
  transaction_id!: string;

  @Column({ type: 'varchar', length: 32, nullable: false })
  event_type!: TajdeedEventType;

  /**
   * Resolved from the centre at enqueue time and then frozen. Relinking a
   * centre to a different branch later must not silently redirect events that
   * were raised against the old one.
   */
  @Column({ type: 'varchar', length: 16, nullable: false })
  branch_code!: string;

  /** The exact envelope payload sent, kept verbatim for replay and audit. */
  @Column({ type: 'jsonb', nullable: false })
  payload!: Record<string, unknown>;

  /* Job FK — set for INSPECTION_RESULT, null for LANE_STATUS. */
  @Column({
    type: 'bigint',
    transformer: bigintAsStringTransformer,
    nullable: true,
  })
  job_id?: string | null;

  @ManyToOne(() => Job, { nullable: true })
  @JoinColumn({ name: 'job_id' })
  job?: Job;

  @Column({
    type: 'bigint',
    transformer: bigintAsStringTransformer,
    nullable: true,
  })
  centre_id?: string | null;

  @ManyToOne(() => Centre, { nullable: true })
  @JoinColumn({ name: 'centre_id' })
  centre?: Centre;

  @Column({
    type: 'bigint',
    transformer: bigintAsStringTransformer,
    nullable: true,
  })
  line_id?: string | null;

  @ManyToOne(() => Line, { nullable: true })
  @JoinColumn({ name: 'line_id' })
  line?: Line;

  @Column({ type: 'varchar', length: 16, default: 'Pending', nullable: false })
  delivery_status!: TajdeedDeliveryStatus;

  /** Null until we have probed the provider for the outcome. */
  @Column({ type: 'varchar', length: 16, nullable: true })
  event_status?: TajdeedEventStatus | null;

  @Column({ type: 'integer', default: 0, nullable: false })
  attempt_count!: number;

  /**
   * When the drain worker may next try. Set on enqueue to now, and pushed
   * forward by the retry schedule after each failure.
   */
  @Column({ type: 'timestamp', nullable: true })
  next_attempt_at?: Date | null;

  /** Provider message or transport error from the most recent failure. */
  @Column({ type: 'text', nullable: true })
  last_error?: string | null;

  /**
   * The provider's raw body from the most recent `POST /events`, verbatim.
   *
   * Kept because `last_error` is a formatted summary, not evidence: when an
   * operator asks why a result was refused, the answer has to be what the
   * provider actually said, not our paraphrase of it. Stored for successes too
   * — a 202 envelope carries their timestamp and echoed transaction_id, which
   * is what proves delivery when the two sides disagree.
   *
   * Null on a transport failure that produced no body (timeout, connection
   * refused), and on rows written before this column existed.
   */
  @Column({ type: 'jsonb', nullable: true })
  last_push_response?: Record<string, unknown> | null;

  /**
   * The provider's raw body from the most recent status probe, verbatim.
   *
   * Separate from `last_push_response` because they answer different
   * questions — one is "did it reach them", the other "what did their worker
   * do with it" — and a row can be Accepted with a FAILED outcome. Collapsing
   * them into one column would overwrite the delivery evidence with the
   * processing evidence.
   */
  @Column({ type: 'jsonb', nullable: true })
  last_status_response?: Record<string, unknown> | null;

  /** When the provider returned 202 (or told us it already held the event). */
  @Column({ type: 'timestamp', nullable: true })
  accepted_at?: Date | null;

  /** When the provider confirmed it had applied the event. */
  @Column({ type: 'timestamp', nullable: true })
  processed_at?: Date | null;

  @CreateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  updated_at!: Date;
}
