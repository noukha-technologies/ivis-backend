import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../common/interfaces/pagination.interface';
import {
  buildTypeOrmPaginationOptions,
  toPaginatedResult,
} from '../../../common/shared/pagination/pagination-query.util';
import { PaginationService } from '../../../common/shared/pagination/pagination.service';
import { IAnprCaptureDao } from '../../transactions/anpr-captures/dao/anpr-capture.dao.interface';
import { AnprCapture } from '../entity/anpr-capture.entity';

@Injectable()
export class AnprCaptureDao extends Repository<AnprCapture> implements IAnprCaptureDao {
  constructor(
    private readonly dataSource: DataSource,
    private readonly paginationService: PaginationService,
  ) {
    super(AnprCapture, dataSource.createEntityManager());
  }

  async findActiveById(id: string): Promise<AnprCapture | null> {
    return this.findOne({
      where: { id, is_deleted: false },
      relations: { camera: true },
    });
  }

  async findByCaptureId(captureId: number): Promise<AnprCapture | null> {
    return this.findOne({ where: { anpr_capture_id: captureId, is_deleted: false } });
  }

  async findPaginated(query: PaginationQueryDto): Promise<PaginatedResult<AnprCapture>> {
    const options = buildTypeOrmPaginationOptions<AnprCapture, AnprCapture>(query, {
      searchFields: ['plate_number', 'normalized_plate', 'lane', 'direction', 'verification_status'],
      allowedSortFields: [
        'anpr_capture_id',
        'plate_number',
        'capture_time',
        'verification_status',
        'created_at',
        'updated_at',
      ],
      defaultSort: { capture_time: 'DESC' },
      baseWhere: { is_deleted: false },
    });

    const response = await this.paginationService.paginate(this, 'anprCapture', options);
    return toPaginatedResult(response);
  }

  async getNextCaptureId(): Promise<number> {
    const result = await this.createQueryBuilder('capture')
      .select('MAX(capture.anpr_capture_id)', 'max')
      .getRawOne();
    const max = result?.max ? Number(result.max) : 0;
    return max + 1;
  }
}

