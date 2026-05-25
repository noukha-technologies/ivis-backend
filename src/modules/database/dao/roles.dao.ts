import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../common/interfaces/pagination.interface';
import {
  buildTypeOrmPaginationOptions,
  toPaginatedResult,
} from '../../../common/shared/pagination/pagination-query.util';
import { PaginationService } from '../../../common/shared/pagination/pagination.service';
import { IRoleDao } from '../../masters/roles/dao/role.dao.interface';
import { Role } from '../entity/role.entity';

@Injectable()
export class RolesDao extends Repository<Role> implements IRoleDao {
  constructor(
    private readonly dataSource: DataSource,
    private readonly paginationService: PaginationService,
  ) {
    super(Role, dataSource.createEntityManager());
  }

  async findActiveById(id: string): Promise<Role | null> {
    return this.findOne({ where: { id, is_deleted: false } });
  }

  async findByRoleName(roleName: string): Promise<Role | null> {
    return this.findOne({ where: { role_name: roleName, is_deleted: false } });
  }

  async findByRoleId(roleId: number): Promise<Role | null> {
    return this.findOne({ where: { role_id: roleId, is_deleted: false } });
  }

  async findPaginated(query: PaginationQueryDto): Promise<PaginatedResult<Role>> {
    const options = buildTypeOrmPaginationOptions<Role, Role>(query, {
      searchFields: ['role_name', 'description'],
      allowedSortFields: ['role_id', 'role_name', 'created_at', 'updated_at'],
      defaultSort: { created_at: 'DESC' },
      baseWhere: { is_deleted: false },
    });

    const response = await this.paginationService.paginate(this, 'role', options);
    return toPaginatedResult(response);
  }
}
