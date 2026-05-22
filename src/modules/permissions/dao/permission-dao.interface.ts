import { PermissionDto, UpsertPermissionDto } from "src/common/dto/permissions.dto"

export interface IPermissionsDao {
    savePermission(newPermission: UpsertPermissionDto): Promise<PermissionDto>
    deletePermission(permissionKeys: string[]): Promise<void>
    getAllPermissions(includeInActive: boolean): Promise<PermissionDto[]>
    getPermissions(permissionKeys: string[]): Promise<PermissionDto[]>
}