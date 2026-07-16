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
import { DATABASE_SCHEMAS } from '../../../common/constants/database-schemas';
import { bigintAsStringTransformer } from '../../../common/utils/bigint-string.transformer';
import { Job } from './job.entity';

export type JobImageSource = 'UPLOAD' | 'CAPTURE';

@Entity({ name: 'job_images', schema: DATABASE_SCHEMAS.TRANSACTION })
@Index('IDX_JOB_IMAGE_JOB_ID', ['job_id'])
export class JobImage {
  @SnowflakePrimaryColumn()
  id!: string;

  @Column({
    type: 'bigint',
    transformer: bigintAsStringTransformer,
    nullable: false,
  })
  job_id!: string;

  @ManyToOne(() => Job, { nullable: false })
  @JoinColumn({ name: 'job_id' })
  job!: Job;

  @Column({ type: 'varchar', nullable: false })
  image_url!: string;

  @Column({ type: 'varchar', length: 16, nullable: false })
  source!: JobImageSource;

  @Column({ type: 'varchar', nullable: true })
  created_by?: string;

  @CreateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  updated_at!: Date;

  @Column({ type: 'boolean', default: false })
  is_deleted!: boolean;
}
