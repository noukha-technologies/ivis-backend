import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../common/interfaces/pagination.interface';
import {
  buildTypeOrmPaginationOptions,
  toPaginatedResult,
} from '../../../common/shared/pagination/pagination-query.util';
import { PaginationService } from '../../../common/shared/pagination/pagination.service';
import { IChargeCategoryDao } from '../../masters/charge-categories/dao/charge-category.dao.interface';
import { ChargeCategory } from '../entity/charge-category.entity';

@Injectable()
export class ChargeCategoryDao
  extends Repository<ChargeCategory>
  implements IChargeCategoryDao
{
  constructor(
    private readonly dataSource: DataSource,
    private readonly paginationService: PaginationService,
  ) {
    super(ChargeCategory, dataSource.createEntityManager());
  }

  async findActiveById(id: string): Promise<ChargeCategory | null> {
    return this.findOne({ where: { id, is_deleted: false } });
  }

  async findPaginated(
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<ChargeCategory>> {
    const qb = this.createQueryBuilder('cc').where(
      'cc.is_deleted = :is_deleted',
      { is_deleted: false },
    );

    const options = buildTypeOrmPaginationOptions<
      ChargeCategory,
      ChargeCategory
    >(query, {
      searchFields: ['cc.vehicle_weight', 'cc.engine_capacity', 'cc.status'],
      allowedSortFields: [
        'category_id',
        'vehicle_weight',
        'engine_capacity',
        'status',
        'created_at',
      ],
      defaultSort: { created_at: 'DESC' },
    });

    const response = await this.paginationService.paginateQueryBuilder(
      qb,
      'cc',
      options,
    );
    return toPaginatedResult(response);
  }

  async getNextCategoryId(): Promise<number> {
    const result = await this.createQueryBuilder('cc')
      .select('MAX(cc.category_id)', 'max')
      .getRawOne();
    const max = result?.max ? Number(result.max) : 0;
    return max + 1;
  }
}
