import { CreateRoleDto, UpdateRoleDto } from '../../../../common/dto/role.dto';
import { PaginationQueryDto } from '../../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../../common/interfaces/pagination.interface';
import { Role } from '../../../database/entity/role.entity';

export interface IRoleDao {
  create(dto: CreateRoleDto): Role;
  save(role: Role): Promise<Role>;
  merge(role: Role, dto: UpdateRoleDto): Role;
  findActiveById(id: string): Promise<Role | null>;
  findByRoleName(roleName: string): Promise<Role | null>;
  findByRoleId(roleId: number): Promise<Role | null>;
  findPaginated(query: PaginationQueryDto): Promise<PaginatedResult<Role>>;
}
