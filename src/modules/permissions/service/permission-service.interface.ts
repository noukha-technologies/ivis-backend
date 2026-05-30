import { PermissionDto, UpsertPermissionDto } from '../../../common/dto/permissions.dto';

export interface IPermissionsService {
  savePermission(newPermission: UpsertPermissionDto): Promise<PermissionDto>;
  getAllPermissions(includeInActive: boolean): Promise<PermissionDto[]>;
  getPermissions(permissionKeys: string[]): Promise<PermissionDto[]>;
}
