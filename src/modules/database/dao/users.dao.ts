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

  private activeUserQueryBuilder() {
    return this.createQueryBuilder('user')
      .leftJoinAndSelect('user.role', 'role')
      .leftJoinAndSelect('role.permission', 'permission')
      .leftJoinAndSelect('user.assignedCentre', 'centre')
      .leftJoinAndSelect(
        'user.lineMappings',
        'lineMapping',
        'lineMapping.is_deleted = :mappingDeleted',
        { mappingDeleted: false },
      )
      .leftJoinAndSelect('lineMapping.line', 'line')
      .andWhere('user.is_deleted = :isDeleted', { isDeleted: false });
  }

  async findActiveById(id: string): Promise<User | null> {
    return this.activeUserQueryBuilder()
      .andWhere('user.id = :id', { id })
      .getOne();
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.activeUserQueryBuilder()
      .andWhere('user.email = :email', { email: email.trim().toLowerCase() })
      .getOne();
  }

  async findByEmailWithPassword(email: string): Promise<User | null> {
    return this.createQueryBuilder('user')
      .leftJoinAndSelect('user.role', 'role')
      .leftJoinAndSelect('role.permission', 'permission')
      .leftJoinAndSelect('user.assignedCentre', 'centre')
      .leftJoinAndSelect(
        'user.lineMappings',
        'lineMapping',
        'lineMapping.is_deleted = :mappingDeleted',
        { mappingDeleted: false },
      )
      .leftJoinAndSelect('lineMapping.line', 'line')
      .addSelect('user.password')
      .where('user.email = :email', { email: email.trim().toLowerCase() })
      .andWhere('user.is_deleted = :isDeleted', { isDeleted: false })
      .getOne();
  }

  async findByUserId(userId: number): Promise<User | null> {
    return this.findOne({ where: { user_id: userId, is_deleted: false } });
  }

  async findByUserCode(userCode: string): Promise<User | null> {
    return this.findOne({
      where: { user_code: userCode.trim().toUpperCase(), is_deleted: false },
    });
  }

  async findActiveByCenterId(centerId: string): Promise<User | null> {
    return this.findOne({
      where: { center_id: centerId, is_deleted: false },
    });
  }

  async findPaginated(query: PaginationQueryDto): Promise<PaginatedResult<User>> {
    const qb = this.createQueryBuilder('user')
      .leftJoinAndSelect('user.role', 'role')
      .leftJoinAndSelect('role.permission', 'permission')
      .leftJoinAndSelect('user.assignedCentre', 'centre')
      .leftJoinAndSelect(
        'user.lineMappings',
        'lineMapping',
        'lineMapping.is_deleted = :mappingDeleted',
        { mappingDeleted: false },
      )
      .leftJoinAndSelect('lineMapping.line', 'line');

    const options = buildTypeOrmPaginationOptions<User, User>(query, {
      searchFields: ['user_name', 'email', 'user_code'],
      allowedSortFields: [
        'user_id',
        'user_code',
        'user_name',
        'email',
        'role_id',
        'center_id',
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
