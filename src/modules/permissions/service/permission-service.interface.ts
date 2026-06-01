import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { CreateRoleAccessDto, RoleAccessDto, UpdateRoleAccessDto } from '../../../common/dto/role-access.dto';
import { PaginatedResult } from '../../../common/interfaces/pagination.interface';

export interface IPermissionsService {
  create(dto: CreateRoleAccessDto): Promise<RoleAccessDto>;
  findAll(query: PaginationQueryDto): Promise<PaginatedResult<RoleAccessDto>>;
  findOne(id: string): Promise<RoleAccessDto>;
  findByRoleName(roleName: string): Promise<RoleAccessDto>;
  update(id: string, dto: UpdateRoleAccessDto): Promise<RoleAccessDto>;
  remove(id: string): Promise<void>;
  listPermissionKeys(): string[];
}
