import { Inject, Injectable } from "@nestjs/common";
import { AppConstants } from "src/common/constants/app.constants";
import { PermissionDto, UpsertPermissionDto } from "src/common/dto/permissions.dto";
import { IPermissionsDao } from "../dao/permission-dao.interface";
import { IPermissionsService } from "./permission-service.interface";

@Injectable()
export class PermissionService implements IPermissionsService {
    constructor(@Inject(AppConstants.PERMISSION_DAO_TOKEN) private readonly permissionDao: IPermissionsDao) { }

    savePermission(newPermission: UpsertPermissionDto): Promise<PermissionDto> {
        return this.permissionDao.savePermission(newPermission)
    }
    getAllPermissions(includeInActive: boolean): Promise<PermissionDto[]> {
        return this.permissionDao.getAllPermissions(includeInActive)
    }
    getPermissions(permissionId: string[]): Promise<PermissionDto[]> {
        return this.permissionDao.getPermissions(permissionId)
    }

}