import { Injectable } from '@nestjs/common';
import { normalizeRoleAccessMatrix } from '../../../common/auth/role-permissions';
import { ALL_PERMISSION_KEYS } from '../../../common/constants/permissions';
import { CreateRoleAccessDto, RoleAccessDto, UpdateRoleAccessDto } from '../../../common/dto/role-access.dto';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import {
  DatabaseException,
  DuplicateResourceException,
  ResourceNotFoundException,
} from '../../../common/exceptions/custom.exception';
import { PaginatedResult } from '../../../common/interfaces/pagination.interface';
import { AppLogger } from '../../../common/logger/app.logger';
import { generateSnowflakeId } from '../../../common/shared/snowflakeIdGeneration';
import { RoleAccessDao } from '../../database/dao/role-access.dao';
import { RoleAccess } from '../../database/entity/role-access.entity';
import { IPermissionsService } from './permission-service.interface';

@Injectable()
export class PermissionService implements IPermissionsService {
  private static readonly context = 'PermissionService';

  constructor(
    private readonly roleAccessDao: RoleAccessDao,
    private readonly logger: AppLogger,
  ) {}

  async create(dto: CreateRoleAccessDto): Promise<RoleAccessDto> {
    this.logger.log(`Creating role access: ${dto.role_name}`, PermissionService.context);

    try {
      const existing = await this.roleAccessDao.findByRoleName(dto.role_name);
      if (existing) {
        throw new DuplicateResourceException('RoleAccess', 'role_name', dto.role_name);
      }

      const roleAccess = this.roleAccessDao.create({
        id: generateSnowflakeId(),
        role_name: dto.role_name.trim(),
        access: normalizeRoleAccessMatrix(dto.access),
        created_by: dto.created_by,
      });
      const saved = await this.roleAccessDao.save(roleAccess);
      return this.toDto(saved);
    } catch (error) {
      if (error instanceof DuplicateResourceException) {
        throw error;
      }
      this.logger.error(
        `Failed to create role access: ${(error as Error).message}`,
        (error as Error).stack,
        PermissionService.context,
      );
      throw new DatabaseException('Failed to create role access. Please try again.');
    }
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<RoleAccessDto>> {
    const result = await this.roleAccessDao.findPaginated(query);
    return {
      ...result,
      data: result.data.map((row) => this.toDto(row)),
    };
  }

  async findOne(id: string): Promise<RoleAccessDto> {
    const row = await this.roleAccessDao.findActiveById(id);
    if (!row) {
      throw new ResourceNotFoundException('RoleAccess', id);
    }
    return this.toDto(row);
  }

  async findByRoleName(roleName: string): Promise<RoleAccessDto> {
    const row = await this.roleAccessDao.findByRoleName(roleName);
    if (!row) {
      throw new ResourceNotFoundException('RoleAccess', roleName);
    }
    return this.toDto(row);
  }

  async update(id: string, dto: UpdateRoleAccessDto): Promise<RoleAccessDto> {
    const row = await this.roleAccessDao.findActiveById(id);
    if (!row) {
      throw new ResourceNotFoundException('RoleAccess', id);
    }

    if (dto.role_name && dto.role_name.trim() !== row.role_name) {
      const duplicate = await this.roleAccessDao.findByRoleName(dto.role_name);
      if (duplicate && duplicate.id !== id) {
        throw new DuplicateResourceException('RoleAccess', 'role_name', dto.role_name);
      }
    }

    const merged = this.roleAccessDao.merge(row, {
      ...(dto.role_name !== undefined ? { role_name: dto.role_name.trim() } : {}),
      ...(dto.access !== undefined ? { access: normalizeRoleAccessMatrix(dto.access) } : {}),
      ...(dto.created_by !== undefined ? { created_by: dto.created_by } : {}),
    });
    const saved = await this.roleAccessDao.save(merged);
    return this.toDto(saved);
  }

  async remove(id: string): Promise<void> {
    const entity = await this.roleAccessDao.findActiveById(id);
    if (!entity) {
      throw new ResourceNotFoundException('RoleAccess', id);
    }
    entity.is_deleted = true;
    await this.roleAccessDao.save(entity);
  }

  listPermissionKeys(): string[] {
    return [...ALL_PERMISSION_KEYS];
  }

  private toDto(row: RoleAccess): RoleAccessDto {
    return {
      id: row.id,
      role_name: row.role_name,
      access: row.access,
      created_by: row.created_by,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}
