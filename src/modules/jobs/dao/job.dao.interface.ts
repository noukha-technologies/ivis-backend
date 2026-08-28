import { DeepPartial } from 'typeorm';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../common/interfaces/pagination.interface';
import { Job } from '../../database/entity/job.entity';

export interface IJobDao {
  create(entityLike: DeepPartial<Job>): Job;
  save(entity: Job): Promise<Job>;
  merge(entity: Job, entityLike: DeepPartial<Job>): Job;
  findActiveById(id: string): Promise<Job | null>;
  findByJobId(jobId: number): Promise<Job | null>;
  /** The vehicle's most recent Completed (and therefore ROP-filed) inspection. */
  findLastCompletedByPlate(plate: string): Promise<Job | null>;
  /** An inspection for this plate that has not finished yet. */
  findUnfinishedByPlate(plate: string): Promise<Job | null>;
  findPaginated(query: PaginationQueryDto): Promise<PaginatedResult<Job>>;
  getNextJobId(): Promise<number>;
}
