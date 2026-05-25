import { Injectable } from '@nestjs/common';
import { DataSource, FindOptionsWhere, ILike, Repository } from 'typeorm';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../common/interfaces/pagination.interface';
import { IUserDao } from '../../users/dao/user.dao.interface';
import { User } from '../entity/user.entity';

@Injectable()
export class UsersDao extends Repository<User> implements IUserDao {
  constructor(private readonly dataSource: DataSource) {
    super(User, dataSource.createEntityManager());
  }

  async findActiveById(id: string): Promise<User | null> {
    return this.findOne({ where: { id, is_deleted: false }, relations: { role: true } });
  }

  async findByEmail(email: string): Promise<User | null> {
    const data = this.findOne({ where: { email, is_deleted: false }, relations: { role: true } });
    return data
  }

  async findByEmailWithPassword(email: string): Promise<User | null> {
    return this.createQueryBuilder('user')
      .leftJoinAndSelect('user.role', 'role')
      .addSelect('user.password')
      .where('user.email = :email', { email: email.trim().toLowerCase() })
      .andWhere('user.is_deleted = :isDeleted', { isDeleted: false })
      .getOne();
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
      relations: { role: true },
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

  async getNextUserId(): Promise<number> {
    const result = await this.createQueryBuilder('user')
      .select('MAX(user.user_id)', 'max')
      .getRawOne();
    const max = result?.max ? Number(result.max) : 0;
    return max + 1;
  }
}
