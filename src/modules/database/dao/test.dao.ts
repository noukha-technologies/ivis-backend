import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../common/interfaces/pagination.interface';
import {
  buildTypeOrmPaginationOptions,
  toPaginatedResult,
} from '../../../common/shared/pagination/pagination-query.util';
import { PaginationService } from '../../../common/shared/pagination/pagination.service';
import { ITestDao } from '../../masters/tests/dao/test.dao.interface';
import { Test } from '../entity/test.entity';

@Injectable()
export class TestDao extends Repository<Test> implements ITestDao {
  constructor(
    private readonly dataSource: DataSource,
    private readonly paginationService: PaginationService,
  ) {
    super(Test, dataSource.createEntityManager());
  }

  async findActiveById(id: string): Promise<Test | null> {
    return this.findOne({ where: { id, is_deleted: false } });
  }

  async findByCode(code: string): Promise<Test | null> {
    return this.findOne({ where: { code, is_deleted: false } });
  }

  async findByTestId(testId: number): Promise<Test | null> {
    return this.findOne({ where: { test_id: testId, is_deleted: false } });
  }

  async findPaginated(query: PaginationQueryDto): Promise<PaginatedResult<Test>> {
    const options = buildTypeOrmPaginationOptions<Test, Test>(query, {
      searchFields: ['name', 'code', 'status'],
      allowedSortFields: [
        'test_id',
        'name',
        'code',
        'status',
        'created_at',
        'updated_at',
      ],
      defaultSort: { created_at: 'DESC' },
      baseWhere: { is_deleted: false },
    });

    const response = await this.paginationService.paginate(this, 'test', options);
    return toPaginatedResult(response);
  }

  async getNextTestId(): Promise<number> {
    const result = await this.createQueryBuilder('test')
      .select('MAX(test.test_id)', 'max')
      .getRawOne();
    const max = result?.max ? Number(result.max) : 0;
    return max + 1;
  }
}
