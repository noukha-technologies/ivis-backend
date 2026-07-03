import { DeepPartial } from 'typeorm';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../common/interfaces/pagination.interface';
import { User } from '../../database/entity/user.entity';

export interface IUserDao {
  create(entityLike: DeepPartial<User>): User;
  save(user: User): Promise<User>;
  merge(user: User, entityLike: DeepPartial<User>): User;
  findActiveById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findByEmailWithPassword(email: string): Promise<User | null>;
  findByUserId(userId: number): Promise<User | null>;
  findByUserCode(userCode: string): Promise<User | null>;
  findPaginated(
    query: PaginationQueryDto,
    centreScope?: { centreId: string },
  ): Promise<PaginatedResult<User>>;
  getNextUserId(): Promise<number>;
}
