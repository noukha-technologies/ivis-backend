import { CreateUserDto, UpdateUserDto } from '../../../common/dto/user.dto';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../common/interfaces/pagination.interface';
import { User } from '../../database/entity/user.entity';

export interface IUsersService {
  create(createUserDto: CreateUserDto): Promise<User>;
  findAll(query: PaginationQueryDto): Promise<PaginatedResult<User>>;
  findOne(id: string): Promise<User>;
  findByEmail(email: string): Promise<User | null>;
  update(id: string, updateUserDto: UpdateUserDto): Promise<User>;
  remove(id: string): Promise<void>;
}
