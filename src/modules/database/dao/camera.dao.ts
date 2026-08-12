import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../common/interfaces/pagination.interface';
import {
  buildTypeOrmPaginationOptions,
  toPaginatedResult,
} from '../../../common/shared/pagination/pagination-query.util';
import { PaginationService } from '../../../common/shared/pagination/pagination.service';
import { Camera } from '../entity/camera.entity';

@Injectable()
export class CameraDao extends Repository<Camera> {
  constructor(
    private readonly dataSource: DataSource,
    private readonly paginationService: PaginationService,
  ) {
    super(Camera, dataSource.createEntityManager());
  }

  async findActiveById(id: string): Promise<Camera | null> {
    return this.findOne({
      where: { id, is_deleted: false },
      relations: { lineMappings: { line: { centre: true } } },
    });
  }

  async findByCode(code: string): Promise<Camera | null> {
    return this.findOne({ where: { code, is_deleted: false } });
  }

  async findByCameraId(cameraId: number): Promise<Camera | null> {
    return this.findOne({ where: { camera_id: cameraId, is_deleted: false } });
  }

  async findActiveByLineId(lineId: string): Promise<Camera | null> {
    return this.createQueryBuilder('camera')
      .innerJoin(
        'camera.lineMappings',
        'mapping',
        'mapping.is_deleted = false AND mapping.line_id = :lineId',
        { lineId },
      )
      .where('camera.is_deleted = false')
      .getOne();
  }

  async findPaginated(
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<Camera>> {
    const qb = this.createQueryBuilder('camera')
      .leftJoinAndSelect(
        'camera.lineMappings',
        'lineMapping',
        'lineMapping.is_deleted = false',
      )
      .leftJoinAndSelect('lineMapping.line', 'line')
      .leftJoinAndSelect('line.centre', 'centre')
      .where('camera.is_deleted = :is_deleted', { is_deleted: false });

    const options = buildTypeOrmPaginationOptions<Camera, Camera>(query, {
      searchFields: [
        'camera.camera_name',
        'camera.code',
        'camera.status',
        'line.name',
        'line.code',
        'centre.centre_name',
        'centre.code',
      ],
      allowedSortFields: [
        'camera_id',
        'camera_name',
        'code',
        'status',
        'created_at',
      ],
      defaultSort: { created_at: 'DESC' },
    });

    const response = await this.paginationService.paginateQueryBuilder(
      qb,
      'camera',
      options,
    );
    return toPaginatedResult(response);
  }

  async getNextId(): Promise<number> {
    const result = await this.createQueryBuilder('cam')
      .select('MAX(cam.camera_id)', 'max')
      .getRawOne();
    return (result?.max ? Number(result.max) : 0) + 1;
  }
}
