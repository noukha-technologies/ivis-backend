import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PermissionDto, UpsertPermissionDto } from '../../../common/dto/permissions.dto';
import { IPermissionsDao } from '../../permissions/dao/permission-dao.interface';
import { Permission } from '../entity/permissions.entity';

@Injectable()
export class PermissionsDao implements IPermissionsDao {
  constructor(
    @InjectRepository(Permission)
    private readonly permissionRepo: Repository<Permission>,
  ) {}

  async savePermission(newPermission: UpsertPermissionDto): Promise<PermissionDto> {
    const existing = await this.permissionRepo.findOne({
      where: { key: newPermission.key, is_deleted: false },
    });

    if (existing) {
      existing.description = newPermission.description;
      if (newPermission.isActive !== undefined) {
        existing.isActive = newPermission.isActive;
      }
      const saved = await this.permissionRepo.save(existing);
      return saved as PermissionDto;
    }

    const permission = this.permissionRepo.create({
      ...newPermission,
      isActive: newPermission.isActive ?? true,
    });
    const saved = await this.permissionRepo.save(permission);
    return saved as PermissionDto;
  }

  async deletePermission(permissionKeys: string[]): Promise<void> {
    await this.permissionRepo.update(
      { key: In(permissionKeys) },
      { is_deleted: true, isActive: false },
    );
  }

  async getAllPermissions(includeInActive: boolean): Promise<PermissionDto[]> {
    const query = this.permissionRepo
      .createQueryBuilder('permission')
      .where('permission.is_deleted = :isDeleted', { isDeleted: false });

    if (!includeInActive) {
      query.andWhere('permission.is_active = :isActive', { isActive: true });
    }

    const permissions = await query.orderBy('permission.key', 'ASC').getMany();
    return permissions as PermissionDto[];
  }

  async getPermissions(permissionKeys: string[]): Promise<PermissionDto[]> {
    if (!permissionKeys.length) {
      return [];
    }

    const permissions = await this.permissionRepo.find({
      where: {
        key: In(permissionKeys),
        is_deleted: false,
        isActive: true,
      },
      order: { key: 'ASC' },
    });
    return permissions as PermissionDto[];
  }
}
