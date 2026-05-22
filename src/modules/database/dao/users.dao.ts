import { Injectable } from '@nestjs/common';
import { DataSource, FindOptionsWhere, ILike, Repository } from 'typeorm';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import { PaginatedResult } from '../../../common/interfaces/pagination.interface.js';
import { User } from '../entity/user.entity.js';
import { IUserDao } from './user.dao.interface.js';

@Injectable()
export class UsersDao extends Repository<User> implements IUserDao {
  constructor(private readonly dataSource: DataSource) {
    super(User, dataSource.createEntityManager());
  }

  async findActiveById(id: string): Promise<User | null> {
    return this.findOne({ where: { id, is_deleted: false } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.findOne({ where: { email, is_deleted: false } });
  }

  async findByUserId(userId: number): Promise<User | null> {
    return this.findOne({ where: { user_id: userId, is_deleted: false } });
  }

  async findPaginated(query: PaginationQueryDto): Promise<PaginatedResult<User>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: FindOptionsWhere<User>[] = [];

    if (query.search) {
      where.push(
        { user_name: ILike(`%${query.search}%`), is_deleted: false },
        { email: ILike(`%${query.search}%`), is_deleted: false },
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
