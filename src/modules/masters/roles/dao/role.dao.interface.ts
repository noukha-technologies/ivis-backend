import { CreateRoleDto, UpdateRoleDto } from '../../../../common/dto/role.dto.js';
import { PaginationQueryDto } from '../../../../common/dto/pagination.dto.js';
import { PaginatedResult } from '../../../../common/interfaces/pagination.interface.js';
import { Role } from '../../../database/entity/role.entity.js';

export interface IRoleDao {
  create(dto: CreateRoleDto): Role;
  save(role: Role): Promise<Role>;
  merge(role: Role, dto: UpdateRoleDto): Role;
  findActiveById(id: string): Promise<Role | null>;
  findByRoleName(roleName: string): Promise<Role | null>;
  findPaginated(query: PaginationQueryDto): Promise<PaginatedResult<Role>>;
}
