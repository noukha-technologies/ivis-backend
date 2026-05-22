import { Injectable } from '@nestjs/common';
import { DataSource, FindOptionsWhere, ILike, Repository } from 'typeorm';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import { PaginatedResult } from '../../../common/interfaces/pagination.interface.js';
import { IRoleDao } from '../../masters/roles/dao/role.dao.interface.js';
import { Role } from '../entity/role.entity.js';

@Injectable()
export class RolesDao extends Repository<Role> implements IRoleDao {
  constructor(private readonly dataSource: DataSource) {
    super(Role, dataSource.createEntityManager());
  }

  async findActiveById(id: string): Promise<Role | null> {
    return this.findOne({ where: { id, is_deleted: false } });
  }

  async findByRoleName(roleName: string): Promise<Role | null> {
    return this.findOne({ where: { role_name: roleName, is_deleted: false } });
  }

  async findPaginated(query: PaginationQueryDto): Promise<PaginatedResult<Role>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: FindOptionsWhere<Role>[] = [];

    if (query.search) {
      where.push(
        { role_name: ILike(`%${query.search}%`), is_deleted: false },
        { description: ILike(`%${query.search}%`), is_deleted: false },
      );
    }

    const [data, total] = await this.findAndCount({
      where: where.length > 0 ? where : { is_deleted: false },
      skip,
      take: limit,
      order: { created_at: 'DESC' },
    });

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }
}
