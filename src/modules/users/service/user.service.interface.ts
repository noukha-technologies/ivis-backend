import { CreateUserDto, UpdateUserDto } from '../../../common/dto/user.dto';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../common/interfaces/pagination.interface';
import { UserResponse } from '../../../common/utils/map-user-response';

export interface IUsersService {
  create(createUserDto: CreateUserDto): Promise<UserResponse>;
  findAll(query: PaginationQueryDto): Promise<PaginatedResult<UserResponse>>;
  findOne(id: string): Promise<UserResponse>;
  findByEmail(email: string): Promise<UserResponse | null>;
  update(id: string, updateUserDto: UpdateUserDto): Promise<UserResponse>;
  remove(id: string): Promise<void>;
}
