import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../common/interfaces/pagination.interface';
import {
  buildTypeOrmPaginationOptions,
  toPaginatedResult,
} from '../../../common/shared/pagination/pagination-query.util';
import { PaginationService } from '../../../common/shared/pagination/pagination.service';
import { IPermissionDao } from '../../permissions/dao/permission.dao.interface';
import { Permission } from '../entity/permission.entity';

@Injectable()
export class PermissionDao
  extends Repository<Permission>
  implements IPermissionDao
{
  constructor(
    private readonly dataSource: DataSource,
    private readonly paginationService: PaginationService,
  ) {
    super(Permission, dataSource.createEntityManager());
  }

  async findActiveById(id: string): Promise<Permission | null> {
    return this.findOne({ where: { id, is_deleted: false } });
  }

  async findByName(name: string): Promise<Permission | null> {
    return this.findOne({
      where: { name: name.trim(), is_deleted: false },
    });
  }

  async findPaginated(
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<Permission>> {
    const options = buildTypeOrmPaginationOptions<Permission, Permission>(
      query,
      {
        searchFields: ['name', 'description'],
        allowedSortFields: ['name', 'created_at', 'updated_at'],
        defaultSort: { created_at: 'DESC' },
        baseWhere: { is_deleted: false },
      },
    );

    const response = await this.paginationService.paginate(
      this,
      'permission',
      options,
    );
    return toPaginatedResult(response);
  }
}
