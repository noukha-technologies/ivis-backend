import { DeepPartial } from 'typeorm';
import { JobImage } from '../../database/entity/job-image.entity';

export interface IJobImageDao {
  create(entityLike: DeepPartial<JobImage>): JobImage;
  save(entity: JobImage): Promise<JobImage>;
  findByJobId(jobId: string): Promise<JobImage[]>;
  findActiveById(id: string): Promise<JobImage | null>;
  softDeleteById(id: string): Promise<void>;
}
