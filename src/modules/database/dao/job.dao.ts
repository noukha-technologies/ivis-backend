import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../common/interfaces/pagination.interface';
import {
  buildTypeOrmPaginationOptions,
  toPaginatedResult,
} from '../../../common/shared/pagination/pagination-query.util';
import { PaginationService } from '../../../common/shared/pagination/pagination.service';
import { IJobDao } from '../../jobs/dao/job.dao.interface';
import { Job } from '../entity/job.entity';

@Injectable()
export class JobDao extends Repository<Job> implements IJobDao {
  private static readonly detailRelations = {
    appointment: true,
    customer: { vehicleRecord: true },
    vehicleRecord: { vehicleMaster: true },
    anprCapture: { currentRopVerification: true },
    centre: true,
    line: true,
    adminPc: true,
    camera: true,
  } as const;

  constructor(
    private readonly dataSource: DataSource,
    private readonly paginationService: PaginationService,
  ) {
    super(Job, dataSource.createEntityManager());
  }

  async findActiveById(id: string): Promise<Job | null> {
    return this.findOne({
      where: { id, is_deleted: false },
      relations: JobDao.detailRelations,
    });
  }

  /**
   * Jobs still tied to a line's lane. Pending counts as active: its IN file has
   * already been written against the current lane, so changing the lane id
   * would leave that file — and the OUT file that answers it — pointing at the
   * wrong lane.
   */
  findActiveByLineId(lineId: string): Promise<Job[]> {
    return (
      this.createQueryBuilder('job')
        // Joined for the lane-status heartbeat, which reports the plate of the
        // vehicle occupying the lane.
        .leftJoinAndSelect('job.vehicleRecord', 'vehicleRecord')
        .where('job.line_id = :lineId', { lineId })
        .andWhere('job.is_deleted = false')
        .andWhere('job.status IN (:...statuses)', {
          statuses: ['Pending', 'In Progress'],
        })
        .orderBy('job.created_at', 'DESC')
        .getMany()
    );
  }

  async findByJobId(jobId: number): Promise<Job | null> {
    return this.findOne({
      where: { job_id: jobId, is_deleted: false },
      relations: JobDao.detailRelations,
    });
  }

  async findPaginated(
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<Job>> {
    const qb = this.createQueryBuilder('job')
      .leftJoinAndSelect('job.appointment', 'appointment')
      .leftJoinAndSelect('job.customer', 'customer')
      .leftJoinAndSelect('customer.vehicleRecord', 'customerVehicle')
      .leftJoinAndSelect('job.vehicleRecord', 'vehicleRecord')
      .leftJoinAndSelect('vehicleRecord.vehicleMaster', 'vehicleMaster')
      .leftJoinAndSelect('job.anprCapture', 'anprCapture')
      .leftJoinAndSelect('anprCapture.currentRopVerification', 'anprRop')
      .leftJoinAndSelect('job.centre', 'centre')
      .leftJoinAndSelect('job.line', 'line')
      .leftJoinAndSelect('job.adminPc', 'adminPc')
      .leftJoinAndSelect('job.camera', 'camera');

    const options = buildTypeOrmPaginationOptions<Job, Job>(query, {
      searchFields: [
        'status',
        'source',
        'customer.owner_name',
        'customer.owner_phone_number',
        'vehicleRecord.plate_number',
        'vehicleRecord.chassis_no',
      ],
      allowedSortFields: [
        'job_id',
        'status',
        'source',
        'overall_result',
        'created_at',
        'updated_at',
        'started_at',
        'completed_at',
      ],
      defaultSort: { created_at: 'DESC' },
      baseWhere: { is_deleted: false },
    });

    const response = await this.paginationService.paginateQueryBuilder(
      qb,
      'job',
      options,
    );
    return toPaginatedResult(response);
  }

  async getNextJobId(): Promise<number> {
    const result = await this.createQueryBuilder('job')
      .select('MAX(job.job_id)', 'max')
      .getRawOne();
    const max = result?.max ? Number(result.max) : 0;
    return max + 1;
  }
}
