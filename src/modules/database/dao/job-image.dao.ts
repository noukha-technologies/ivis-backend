import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { IJobImageDao } from '../../jobs/dao/job-image.dao.interface';
import { JobImage } from '../entity/job-image.entity';

@Injectable()
export class JobImageDao extends Repository<JobImage> implements IJobImageDao {
  constructor(private readonly dataSource: DataSource) {
    super(JobImage, dataSource.createEntityManager());
  }

  async findByJobId(jobId: string): Promise<JobImage[]> {
    return this.find({
      where: { job_id: jobId, is_deleted: false },
      order: { created_at: 'ASC' },
    });
  }

  async findActiveById(id: string): Promise<JobImage | null> {
    return this.findOne({ where: { id, is_deleted: false } });
  }

  async softDeleteById(id: string): Promise<void> {
    await this.update({ id }, { is_deleted: true });
  }
}
