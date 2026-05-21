import { Injectable } from '@nestjs/common';
import { Repository, DataSource, ILike } from 'typeorm';
import { User } from '../entities/user.entity.js';
import { PaginationQueryDto } from '../dto/pagination-query.dto.js';

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

@Injectable()
export class UsersRepository extends Repository<User> {
  constructor(private readonly dataSource: DataSource) {
    super(User, dataSource.createEntityManager());
  }

  /**
   * Find user by email (active users only)
   */
  async findByEmail(email: string): Promise<User | null> {
    return this.findOne({ where: { email, is_deleted: false } });
  }

  /**
   * Find user by user_id (integer, active users only)
   */
  async findByUserId(userId: number): Promise<User | null> {
    return this.findOne({ where: { user_id: userId, is_deleted: false } });
  }

  /**
   * Paginated find with optional search by user_name or email
   */
  async findPaginated(query: PaginationQueryDto): Promise<PaginatedResult<User>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: any[] = [];

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
