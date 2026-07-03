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
      relations: { line: true },
    });
  }

  async findByCode(code: string): Promise<Camera | null> {
    return this.findOne({ where: { code, is_deleted: false } });
  }

  async findByCameraId(cameraId: number): Promise<Camera | null> {
    return this.findOne({ where: { camera_id: cameraId, is_deleted: false } });
  }

  async findActiveByLineId(lineId: string): Promise<Camera | null> {
    return this.findOne({ where: { line_id: lineId, is_deleted: false } });
  }

  async findPaginated(
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<Camera>> {
    const qb = this.createQueryBuilder('camera')
      .leftJoinAndSelect('camera.line', 'line')
      .where('camera.is_deleted = :is_deleted', { is_deleted: false });

    const options = buildTypeOrmPaginationOptions<Camera, Camera>(query, {
      searchFields: ['camera.camera_name', 'camera.code', 'camera.status'],
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
