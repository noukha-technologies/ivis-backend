import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../common/interfaces/pagination.interface';
import { Role } from '../../database/entity/role.entity';

export interface IRoleDao {
  findActiveById(id: string): Promise<Role | null>;
  findActiveByIdWithPermission(id: string): Promise<Role | null>;
  findByRoleName(roleName: string): Promise<Role | null>;
  findByPermissionId(permissionId: string): Promise<Role | null>;
  countActiveUsersByRoleId(roleId: string): Promise<number>;
  findPaginated(query: PaginationQueryDto): Promise<PaginatedResult<Role>>;
  save(role: Role): Promise<Role>;
  create(entity: Partial<Role>): Role;
  merge(existing: Role, partial: Partial<Role>): Role;
}
