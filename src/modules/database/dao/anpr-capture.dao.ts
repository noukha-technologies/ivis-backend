import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../common/interfaces/pagination.interface';
import { IAnprCaptureDao } from '../../transactions/anpr-captures/dao/anpr-capture.dao.interface';
import {
  buildTypeOrmPaginationOptions,
  toPaginatedResult,
} from '../../../common/shared/pagination/pagination-query.util';

import { AnprCapture } from '../entity/anpr-capture.entity';
import { PaginationService } from '../../../common/shared/pagination/pagination.service';

@Injectable()
export class AnprCaptureDao
  extends Repository<AnprCapture>
  implements IAnprCaptureDao
{
  constructor(
    private readonly dataSource: DataSource,
    private readonly paginationService: PaginationService,
  ) {
    super(AnprCapture, dataSource.createEntityManager());
  }

  async findActiveById(id: string): Promise<AnprCapture | null> {
    return this.findOne({
      where: { id, is_deleted: false },
      relations: {
        camera: { lineMappings: { line: { centre: true } } },
        rop_verifications: true,
        currentRopVerification: true,
      },
    });
  }

  async findByCaptureId(captureId: number): Promise<AnprCapture | null> {
    return this.findOne({
      where: { anpr_capture_id: captureId, is_deleted: false },
    });
  }

  /** Most recent capture for a plate (used to source plate colour for walk-ins). */
  async findLatestByPlate(plateNumber: string): Promise<AnprCapture | null> {
    return this.findOne({
      where: { plate_number: plateNumber, is_deleted: false },
      order: { capture_time: 'DESC' },
    });
  }

  async findPaginated(
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<AnprCapture>> {
    const qb = this.createQueryBuilder('anprCapture')
      .leftJoinAndSelect('anprCapture.camera', 'camera')
      .leftJoinAndSelect('camera.lineMappings', 'lineMapping', 'lineMapping.is_deleted = false')
      .leftJoinAndSelect('lineMapping.line', 'cameraLine')
      .leftJoinAndSelect('cameraLine.centre', 'cameraCentre')
      .leftJoinAndSelect(
        'anprCapture.rop_verifications',
        'rop_verifications',
        'rop_verifications.is_deleted = false',
      )
      .leftJoinAndSelect(
        'anprCapture.currentRopVerification',
        'currentRopVerification',
      );

    const options = buildTypeOrmPaginationOptions<AnprCapture, AnprCapture>(
      query,
      {
        searchFields: [
          'plate_number',
          'normalized_plate',
          'line_id',
          'direction',
        ],
        allowedSortFields: [
          'anpr_capture_id',
          'plate_number',
          'capture_time',
          'created_at',
          'updated_at',
        ],
        defaultSort: { capture_time: 'DESC' },
        baseWhere: { is_deleted: false },
      },
    );

    const response = await this.paginationService.paginateQueryBuilder(
      qb,
      'anprCapture',
      options,
    );
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
