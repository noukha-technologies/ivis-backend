import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../common/interfaces/pagination.interface';
import {
  buildTypeOrmPaginationOptions,
  toPaginatedResult,
} from '../../../common/shared/pagination/pagination-query.util';
import { PaginationService } from '../../../common/shared/pagination/pagination.service';
import { IUserDao } from '../../users/dao/user.dao.interface';
import { User } from '../entity/user.entity';

@Injectable()
export class UsersDao extends Repository<User> implements IUserDao {
  constructor(
    private readonly dataSource: DataSource,
    private readonly paginationService: PaginationService,
  ) {
    super(User, dataSource.createEntityManager());
  }

  async findActiveById(id: string): Promise<User | null> {
    return this.findOne({ where: { id, is_deleted: false }, relations: { role: true } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.findOne({ where: { email, is_deleted: false }, relations: { role: true } });
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
    const qb = this.createQueryBuilder('user').leftJoinAndSelect('user.role', 'role');

    const options = buildTypeOrmPaginationOptions<User, User>(query, {
      searchFields: ['user_name', 'email', 'center', 'line'],
      allowedSortFields: [
        'user_id',
        'user_name',
        'email',
        'center',
        'line',
        'created_at',
        'updated_at',
      ],
      defaultSort: { created_at: 'DESC' },
      baseWhere: { is_deleted: false },
    });

    const response = await this.paginationService.paginateQueryBuilder(qb, 'user', options);
    return toPaginatedResult(response);
  }

  async getNextUserId(): Promise<number> {
    const result = await this.createQueryBuilder('user')
      .select('MAX(user.user_id)', 'max')
      .getRawOne();
    const max = result?.max ? Number(result.max) : 0;
    return max + 1;
  }
}
