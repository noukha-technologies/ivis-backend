import { CreateUserDto, UpdateUserDto } from '../../../common/dto/user.dto.js';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import { PaginatedResult } from '../../../common/interfaces/pagination.interface.js';
import { User } from '../../database/entity/user.entity.js';

export interface IUsersService {
  create(createUserDto: CreateUserDto): Promise<User>;
  findAll(query: PaginationQueryDto): Promise<PaginatedResult<User>>;
  findOne(id: string): Promise<User>;
  findByEmail(email: string): Promise<User | null>;
  update(id: string, updateUserDto: UpdateUserDto): Promise<User>;
  remove(id: string): Promise<void>;
}
