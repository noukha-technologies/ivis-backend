import { Injectable } from '@nestjs/common';
import { PermissionDto, UpsertPermissionDto } from '../../../common/dto/permissions.dto';
import { PermissionsDao } from '../../database/dao/permissions.dao';
import { IPermissionsService } from './permission-service.interface';

@Injectable()
export class PermissionService implements IPermissionsService {
  constructor(private readonly permissionDao: PermissionsDao) {}

  savePermission(newPermission: UpsertPermissionDto): Promise<PermissionDto> {
    return this.permissionDao.savePermission(newPermission);
  }

  getAllPermissions(includeInActive: boolean): Promise<PermissionDto[]> {
    return this.permissionDao.getAllPermissions(includeInActive);
  }

  getPermissions(permissionKeys: string[]): Promise<PermissionDto[]> {
    return this.permissionDao.getPermissions(permissionKeys);
  }
}
