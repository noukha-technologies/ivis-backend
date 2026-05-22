import { CreateUserDto, UpdateUserDto } from '../../../common/dto/user.dto.js';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import { PaginatedResult } from '../../../common/interfaces/pagination.interface.js';
import { User } from '../../database/entity/user.entity.js';

export interface IUserDao {
  create(dto: CreateUserDto): User;
  save(user: User): Promise<User>;
  merge(user: User, dto: UpdateUserDto): User;
  findActiveById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findByEmailWithPassword(email: string): Promise<User | null>;
  findByUserId(userId: number): Promise<User | null>;
  findPaginated(query: PaginationQueryDto): Promise<PaginatedResult<User>>;
}
