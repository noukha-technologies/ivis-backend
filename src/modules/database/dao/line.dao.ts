import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../common/interfaces/pagination.interface';
import {
  buildTypeOrmPaginationOptions,
  toPaginatedResult,
} from '../../../common/shared/pagination/pagination-query.util';
import { PaginationService } from '../../../common/shared/pagination/pagination.service';
import { ILineDao } from '../../masters/lines/dao/line.dao.interface';
import { Line } from '../entity/line.entity';

@Injectable()
export class LineDao extends Repository<Line> implements ILineDao {
  constructor(
    private readonly dataSource: DataSource,
    private readonly paginationService: PaginationService,
  ) {
    super(Line, dataSource.createEntityManager());
  }

  async findActiveById(id: string): Promise<Line | null> {
    return this.findOne({ where: { id, is_deleted: false } });
  }

  async findByCode(code: string): Promise<Line | null> {
    return this.findOne({ where: { code, is_deleted: false } });
  }

  async findByLineId(lineId: number): Promise<Line | null> {
    return this.findOne({ where: { line_id: lineId, is_deleted: false } });
  }

  async findPaginated(query: PaginationQueryDto): Promise<PaginatedResult<Line>> {
    const options = buildTypeOrmPaginationOptions<Line, Line>(query, {
      searchFields: ['name', 'code', 'status'],
      allowedSortFields: ['line_id', 'name', 'code', 'display_order', 'status', 'created_at', 'updated_at'],
      defaultSort: { created_at: 'DESC' },
      baseWhere: { is_deleted: false },
    });

    const response = await this.paginationService.paginate(this, 'line', options);
    return toPaginatedResult(response);
  }

  async getNextLineId(): Promise<number> {
    const result = await this.createQueryBuilder('line')
      .select('MAX(line.line_id)', 'max')
      .getRawOne();
    const max = result?.max ? Number(result.max) : 0;
    return max + 1;
  }
}
