import { PermissionDto, UpsertPermissionDto } from "src/common/dto/permissions.dto";

export interface IPermissionsService {
    savePermission(newPermission: UpsertPermissionDto): Promise<PermissionDto>
    getAllPermissions(includeInActive: boolean): Promise<PermissionDto[]>
    getPermissions(permissionId: string[]): Promise<PermissionDto[]>
}