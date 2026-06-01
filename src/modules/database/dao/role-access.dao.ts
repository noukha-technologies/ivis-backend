import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../common/interfaces/pagination.interface';
import {
  buildTypeOrmPaginationOptions,
  toPaginatedResult,
} from '../../../common/shared/pagination/pagination-query.util';
import { PaginationService } from '../../../common/shared/pagination/pagination.service';
import { IRoleAccessDao } from '../../permissions/dao/role-access.dao.interface';
import { RoleAccess } from '../entity/role-access.entity';

@Injectable()
export class RoleAccessDao extends Repository<RoleAccess> implements IRoleAccessDao {
  constructor(
    private readonly dataSource: DataSource,
    private readonly paginationService: PaginationService,
  ) {
    super(RoleAccess, dataSource.createEntityManager());
  }

  async findActiveById(id: string): Promise<RoleAccess | null> {
    return this.findOne({ where: { id, is_deleted: false } });
  }

  async findByRoleName(roleName: string): Promise<RoleAccess | null> {
    return this.findOne({
      where: { role_name: roleName.trim(), is_deleted: false },
    });
  }

  async findPaginated(query: PaginationQueryDto): Promise<PaginatedResult<RoleAccess>> {
    const options = buildTypeOrmPaginationOptions<RoleAccess, RoleAccess>(query, {
      searchFields: ['role_name'],
      allowedSortFields: ['role_name', 'created_at', 'updated_at'],
      defaultSort: { created_at: 'DESC' },
      baseWhere: { is_deleted: false },
    });

    const response = await this.paginationService.paginate(this, 'role_access', options);
    return toPaginatedResult(response);
  }
}
