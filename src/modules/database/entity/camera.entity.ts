import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  UpdateDateColumn,
} from 'typeorm';

import { Line } from './line.entity';
import { SnowflakePrimaryColumn } from './snowflake-id.column';
import { ICameraMasterFields } from '../../../common/interfaces/master.interface';

@Entity({ name: 'cameras', schema: 'master' })
export class Camera implements ICameraMasterFields {
  @SnowflakePrimaryColumn()
  id!: string;

  @Column({ type: 'integer', unique: true, nullable: false })
  @Index('IDX_CAMERA_CAMERA_ID', { unique: true })
  camera_id!: number;

  @Column({ type: 'varchar', nullable: false })
  camera_name!: string;

  @Column({ type: 'varchar', unique: true, nullable: false })
  @Index('IDX_CAMERA_CODE', { unique: true })
  code!: string;

  @Column({ type: 'bigint' })
  @Index('UQ_CAMERA_LINE_ID', { unique: true, where: '"is_deleted" = false' })
  line_id!: string;

  @OneToOne(() => Line, (line) => line.camera, { nullable: false })
  @JoinColumn({ name: 'line_id' })
  line!: Line;

  @Column({ type: 'varchar', nullable: false })
  ip_address!: string;

  @Column({ type: 'integer', nullable: false, default: 80 })
  port!: number;

  @Column({ type: 'varchar', nullable: true })
  username?: string;

  @Column({ type: 'varchar', nullable: true })
  password?: string;

  @Column({
    type: 'varchar',
    nullable: true,
    enum: ['ftp', 'http'],
    default: 'ftp',
  })
  integration_method?: string;

  @Column({ type: 'varchar', nullable: true })
  ftp_directory?: string;

  @Column({ type: 'boolean', default: false })
  is_online!: boolean;

  @Column({ type: 'timestamp', nullable: true })
  last_event_at?: Date;

  @Column({ type: 'timestamp', nullable: true })
  last_health_check?: Date;

  @Column({ type: 'varchar', default: 'NOT_REACHABLE', nullable: false })
  health_status!: string;

  @Column({ type: 'timestamp', nullable: true })
  last_seen_at?: Date;

  @Column({ type: 'integer', default: 30, nullable: false })
  health_ping_interval_seconds!: number;

  @Column({ type: 'varchar', nullable: true })
  description?: string;

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

  // ─── Compatibility getters for ANPR module (camelCase aliases) ───────────────
  get cameraCode(): string {
    return this.code;
  }
  get isActive(): boolean {
    return this.status === 'Active' && !this.is_deleted;
  }
  get integrationMethod(): string {
    return this.integration_method ?? 'http';
  }
  get ftpDirectory(): string | undefined {
    return this.ftp_directory;
  }
  get ipAddress(): string {
    return this.ip_address;
  }
  get isOnline(): boolean {
    return this.is_online;
  }
  set isOnline(val: boolean) {
    this.is_online = val;
  }
  get lastSeenAt(): Date | undefined {
    return this.last_seen_at;
  }
  set lastSeenAt(val: Date | undefined) {
    this.last_seen_at = val;
  }
  get lastEventAt(): Date | undefined {
    return this.last_event_at;
  }
  set lastEventAt(val: Date | undefined) {
    this.last_event_at = val;
  }
  get centreCode(): string | undefined {
    return undefined;
  }
  get laneNumber(): number | null {
    return null;
  }
  get macAddress(): string | null {
    return null;
  }
}

export { Camera as CameraEntity };
