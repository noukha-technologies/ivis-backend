import { Injectable } from '@nestjs/common';
import { CreateRoleDto, RoleDto, UpdateRoleDto } from '../../../common/dto/role.dto';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import {
  DatabaseException,
  DuplicateResourceException,
  ResourceNotFoundException,
} from '../../../common/exceptions/custom.exception';
import { ErrorException } from '../../../common/errors/custom-error.exception';
import { PaginatedResult } from '../../../common/interfaces/pagination.interface';
import { AppLogger } from '../../../common/logger/app.logger';
import type { UserContext } from '../../../common/dto/auth.dto';
import { getCreatedById } from '../../../common/utils/created-by.util';
import { generateSnowflakeId } from '../../../common/shared/snowflakeIdGeneration';
import { PermissionDao } from '../../database/dao/permission.dao';
import { RoleDao } from '../../database/dao/role.dao';
import { Role } from '../../database/entity/role.entity';

@Injectable()
export class RolesService {
  private static readonly context = 'RolesService';

  constructor(
    private readonly roleDao: RoleDao,
    private readonly permissionDao: PermissionDao,
    private readonly logger: AppLogger,
  ) { }

  async create(dto: CreateRoleDto, actor: UserContext): Promise<RoleDto> {
    this.logger.log(`Creating role: ${dto.role_name}`, RolesService.context);

    try {
      const existing = await this.roleDao.findByRoleName(dto.role_name);
      if (existing) {
        throw new DuplicateResourceException('Role', 'role_name', dto.role_name);
      }

      const permission = await this.permissionDao.findActiveById(dto.permission_id);
      if (!permission) {
        throw new ResourceNotFoundException('Permission', dto.permission_id);
      }

      const permissionInUse = await this.roleDao.findByPermissionId(dto.permission_id);
      if (permissionInUse) {
        throw new DuplicateResourceException(
          'Role',
          'permission_id',
          `already linked to role "${permissionInUse.role_name}"`,
        );
      }

      const role = this.roleDao.create({
        id: generateSnowflakeId(),
        role_name: dto.role_name.trim(),
        permission_id: permission.id,
        description: dto.description?.trim(),
        created_by: getCreatedById(actor),
      });
      const saved = await this.roleDao.save(role);
      return this.findOne(saved.id);
    } catch (error) {
      if (
        error instanceof DuplicateResourceException ||
        error instanceof ResourceNotFoundException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to create role: ${(error as Error).message}`,
        (error as Error).stack,
        RolesService.context,
      );
      throw new DatabaseException('Failed to create role. Please try again.');
    }
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<RoleDto>> {
    const result = await this.roleDao.findPaginated(query);
    return {
      ...result,
      data: result.data.map((row) => this.toDto(row)),
    };
  }

  async findOne(id: string): Promise<RoleDto> {
    const row = await this.roleDao.findActiveByIdWithPermission(id);
    if (!row) {
      throw new ResourceNotFoundException('Role', id);
    }
    return this.toDto(row);
  }

  async findByRoleName(roleName: string): Promise<RoleDto> {
    const row = await this.roleDao.findByRoleName(roleName);
    if (!row) {
      throw new ResourceNotFoundException('Role', roleName);
    }
    return this.findOne(row.id);
  }

  async update(id: string, dto: UpdateRoleDto): Promise<RoleDto> {
    const row = await this.roleDao.findActiveById(id);
    if (!row) {
      throw new ResourceNotFoundException('Role', id);
    }

    if (dto.role_name && dto.role_name.trim() !== row.role_name) {
      const duplicate = await this.roleDao.findByRoleName(dto.role_name);
      if (duplicate && duplicate.id !== id) {
        throw new DuplicateResourceException('Role', 'role_name', dto.role_name);
      }
    }

    if (dto.permission_id && dto.permission_id !== row.permission_id) {
      const permission = await this.permissionDao.findActiveById(dto.permission_id);
      if (!permission) {
        throw new ResourceNotFoundException('Permission', dto.permission_id);
      }
      const permissionInUse = await this.roleDao.findByPermissionId(dto.permission_id);
      if (permissionInUse && permissionInUse.id !== id) {
        throw new DuplicateResourceException(
          'Role',
          'permission_id',
          `already linked to role "${permissionInUse.role_name}"`,
        );
      }
    }

    const merged = this.roleDao.merge(row, {
      ...(dto.role_name !== undefined ? { role_name: dto.role_name.trim() } : {}),
      ...(dto.permission_id !== undefined ? { permission_id: dto.permission_id } : {}),
      ...(dto.description !== undefined ? { description: dto.description?.trim() } : {}),
    });
    await this.roleDao.save(merged);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const entity = await this.roleDao.findActiveById(id);
    if (!entity) {
      throw new ResourceNotFoundException('Role', id);
    }


    const userCount = await this.roleDao.countActiveUsersByRoleId(id);
    if (userCount > 0) {
      throw new ErrorException(
        'FORBIDDEN_REQUEST',
        `Cannot delete role: ${userCount} user(s) are still assigned.`,
      );
    }

    entity.is_deleted = true;
    await this.roleDao.save(entity);
  }

  private toDto(row: Role): RoleDto {
    return {
      id: row.id,
      role_id: row.role_id,
      role_name: row.role_name,
      permission_id: row.permission_id,
      description: row.description,
      created_by: row.created_by,
      created_at: row.created_at,
      updated_at: row.updated_at,
      permission: row.permission
        ? {
          id: row.permission.id,
          name: row.permission.name,
          access: row.permission.access,
          is_active: row.permission.is_active,
          created_by: row.permission.created_by,
          created_at: row.permission.created_at,
          updated_at: row.permission.updated_at,
        }
        : undefined,
    };
  }
}
