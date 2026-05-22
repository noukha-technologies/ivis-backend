import { CreateRoleDto, UpdateRoleDto } from '../../../../common/dto/role.dto';
import { PaginationQueryDto } from '../../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../../common/interfaces/pagination.interface';
import { Role } from '../../../database/entity/role.entity';

export interface IRolesService {
  create(createRoleDto: CreateRoleDto): Promise<Role>;
  findAll(query: PaginationQueryDto): Promise<PaginatedResult<Role>>;
  findOne(id: string): Promise<Role>;
  findByRoleName(roleName: string): Promise<Role | null>;
  update(id: string, updateRoleDto: UpdateRoleDto): Promise<Role>;
  remove(id: string): Promise<void>;
}
