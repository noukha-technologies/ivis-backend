import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../common/interfaces/pagination.interface';
import { Permission } from '../../database/entity/permission.entity';

export interface IPermissionDao {
  findActiveById(id: string): Promise<Permission | null>;
  findByName(name: string): Promise<Permission | null>;
  findPaginated(query: PaginationQueryDto): Promise<PaginatedResult<Permission>>;
  save(permission: Permission): Promise<Permission>;
  create(entity: Partial<Permission>): Permission;
  merge(existing: Permission, partial: Partial<Permission>): Permission;
}
