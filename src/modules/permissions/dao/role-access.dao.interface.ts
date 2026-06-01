import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../common/interfaces/pagination.interface';
import { RoleAccess } from '../../database/entity/role-access.entity';

export interface IRoleAccessDao {
  findActiveById(id: string): Promise<RoleAccess | null>;
  findByRoleName(roleName: string): Promise<RoleAccess | null>;
  findPaginated(query: PaginationQueryDto): Promise<PaginatedResult<RoleAccess>>;
  save(roleAccess: RoleAccess): Promise<RoleAccess>;
  create(entity: Partial<RoleAccess>): RoleAccess;
  merge(existing: RoleAccess, partial: Partial<RoleAccess>): RoleAccess;
}
