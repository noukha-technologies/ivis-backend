import { Injectable } from '@nestjs/common';
import { DataSource, IsNull, Repository } from 'typeorm';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../common/interfaces/pagination.interface';
import {
  buildTypeOrmPaginationOptions,
  toPaginatedResult,
} from '../../../common/shared/pagination/pagination-query.util';
import { PaginationService } from '../../../common/shared/pagination/pagination.service';
import { IRoleDao } from '../../roles/dao/role.dao.interface';
import { Role } from '../entity/role.entity';
import { User } from '../entity/user.entity';

@Injectable()
export class RoleDao extends Repository<Role> implements IRoleDao {
  constructor(
    private readonly dataSource: DataSource,
    private readonly paginationService: PaginationService,
  ) {
    super(Role, dataSource.createEntityManager());
  }

  async findActiveById(id: string): Promise<Role | null> {
    return this.findOne({ where: { id, is_deleted: false } });
  }

  async findActiveByIdWithPermission(id: string): Promise<Role | null> {
    return this.findOne({
      where: { id, is_deleted: false },
      relations: { permission: true, centre: true },
    });
  }

  async findByRoleName(roleName: string): Promise<Role | null> {
    return this.findOne({
      where: { role_name: roleName.trim(), is_deleted: false },
    });
  }

  async findByRoleNameInScope(
    roleName: string,
    centreId: string | null,
  ): Promise<Role | null> {
    return this.findOne({
      where: {
        role_name: roleName.trim(),
        center_id: centreId ?? IsNull(),
        is_deleted: false,
      },
    });
  }

  async findByPermissionId(permissionId: string): Promise<Role | null> {
    return this.findOne({
      where: { permission_id: permissionId, is_deleted: false },
    });
  }

  async countActiveUsersByRoleId(roleId: string): Promise<number> {
    return this.manager.getRepository(User).count({
      where: { role_id: roleId, is_deleted: false },
    });
  }

  async findPaginated(
    query: PaginationQueryDto,
    centreScope?: { centreId: string },
  ): Promise<PaginatedResult<Role>> {
    const qb = this.createQueryBuilder('role')
      .leftJoinAndSelect('role.permission', 'permission')
      .leftJoinAndSelect('role.centre', 'centre')
      .where('role.is_deleted = :isDeleted', { isDeleted: false });

    if (centreScope) {
      // Centre Admin: only their own centre's roles (global roles excluded).
      qb.andWhere('role.center_id = :scopeCentreId', { scopeCentreId: centreScope.centreId });
    }

    const options = buildTypeOrmPaginationOptions<Role, Role>(query, {
      searchFields: ['role.role_name', 'role.description'],
      allowedSortFields: ['role_id', 'role_name', 'created_at', 'updated_at'],
      defaultSort: { created_at: 'DESC' },
    });

    const response = await this.paginationService.paginateQueryBuilder(qb, 'role', options);
    return toPaginatedResult(response);
  }
}
