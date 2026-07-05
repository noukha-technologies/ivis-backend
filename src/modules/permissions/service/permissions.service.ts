import { Injectable } from '@nestjs/common';
import { ALL_PERMISSION_KEYS } from '../../../common/constants/permissions';

import { ErrorException } from '../../../common/errors/custom-error.exception';
import {
  DatabaseException,
  DuplicateResourceException,
  ResourceNotFoundException,
} from '../../../common/exceptions/custom.exception';

import { AppLogger } from '../../../common/logger/app.logger';
import { getCreatedById } from '../../../common/utils/created-by.util';
import { PaginatedResult } from '../../../common/interfaces/pagination.interface';
import { generateSnowflakeId } from '../../../common/shared/snowflakeIdGeneration';
import { validateAccessMatrix } from '../../../common/utils/validate-access-matrix';

import { Permission } from '../../database/entity/permission.entity';

import { RoleDao } from '../../database/dao/role.dao';
import { PermissionDao } from '../../database/dao/permission.dao';
import { UserSessionsDao } from '../../database/dao/user-sessions.dao';

import type { UserContext } from '../../../common/dto/auth.dto';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import {
  CreatePermissionProfileDto,
  PermissionProfileDto,
  UpdatePermissionProfileDto,
} from '../../../common/dto/permission-profile.dto';

@Injectable()
export class PermissionService {
  private static readonly context = 'PermissionService';

  constructor(
    private readonly permissionDao: PermissionDao,
    private readonly roleDao: RoleDao,
    private readonly userSessionsDao: UserSessionsDao,
    private readonly logger: AppLogger,
  ) {}

  async create(
    dto: CreatePermissionProfileDto,
    actor: UserContext,
  ): Promise<PermissionProfileDto> {
    this.logger.log(
      `Creating permission profile: ${dto.name}`,
      PermissionService.context,
    );

    try {
      const existing = await this.permissionDao.findByName(dto.name);
      if (existing) {
        throw new DuplicateResourceException('Permission', 'name', dto.name);
      }

      const access = validateAccessMatrix(dto.access);
      const permission = this.permissionDao.create({
        id: generateSnowflakeId(),
        name: dto.name.trim(),
        access,
        is_active: dto.is_active ?? true,
        created_by: 'System Admin',
      });
      const saved = await this.permissionDao.save(permission);
      return this.toDto(saved);
    } catch (error) {
      if (error instanceof DuplicateResourceException) {
        throw error;
      }
      this.logger.error(
        `Failed to create permission profile: ${(error as Error).message}`,
        (error as Error).stack,
        PermissionService.context,
      );
      throw new DatabaseException(
        'Failed to create permission profile. Please try again.',
      );
    }
  }

  async findAll(
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<PermissionProfileDto>> {
    const result = await this.permissionDao.findPaginated(query);
    return {
      ...result,
      data: result.data.map((row) => this.toDto(row)),
    };
  }

  async findOne(id: string): Promise<PermissionProfileDto> {
    const row = await this.permissionDao.findActiveById(id);
    if (!row) {
      throw new ResourceNotFoundException('Permission', id);
    }
    return this.toDto(row);
  }

  async update(
    id: string,
    dto: UpdatePermissionProfileDto,
  ): Promise<PermissionProfileDto> {
    const row = await this.permissionDao.findActiveById(id);
    if (!row) {
      throw new ResourceNotFoundException('Permission', id);
    }

    if (dto.name && dto.name.trim() !== row.name) {
      const duplicate = await this.permissionDao.findByName(dto.name);
      if (duplicate && duplicate.id !== id) {
        throw new DuplicateResourceException('Permission', 'name', dto.name);
      }
    }

    const access =
      dto.access !== undefined ? validateAccessMatrix(dto.access) : row.access;

    const merged = this.permissionDao.merge(row, {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.description !== undefined
        ? { description: dto.description?.trim() }
        : {}),
      ...(dto.access !== undefined ? { access } : {}),
      ...(dto.is_active !== undefined ? { is_active: dto.is_active } : {}),
    });
    const saved = await this.permissionDao.save(merged);

    if (dto.access !== undefined) {
      await this.userSessionsDao.deleteByPermissionId(id);
    }

    return this.toDto(saved);
  }

  async remove(id: string): Promise<void> {
    const entity = await this.permissionDao.findActiveById(id);
    if (!entity) {
      throw new ResourceNotFoundException('Permission', id);
    }

    const linkedRole = await this.roleDao.findByPermissionId(id);
    if (linkedRole) {
      throw new ErrorException(
        'FORBIDDEN_REQUEST',
        `Permission profile is linked to role "${linkedRole.role_name}" and cannot be deleted.`,
      );
    }

    entity.is_deleted = true;
    await this.permissionDao.save(entity);
  }

  listPermissionKeys(): string[] {
    return [...ALL_PERMISSION_KEYS];
  }

  private toDto(row: Permission): PermissionProfileDto {
    return {
      id: row.id,
      name: row.name,
      access: row.access,
      is_active: row.is_active,
      created_by: row.created_by,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}
