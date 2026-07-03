import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
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
import { AccessScope, DEFAULT_ACCESS_SCOPE, isGlobalScope } from '../../../common/constants/access-scope';
import { PermissionDao } from '../../database/dao/permission.dao';
import { RoleDao } from '../../database/dao/role.dao';
import { CentreDao } from '../../database/dao/centre.dao';
import { Role } from '../../database/entity/role.entity';

@Injectable()
export class RolesService {
  private static readonly context = 'RolesService';

  constructor(
    private readonly roleDao: RoleDao,
    private readonly permissionDao: PermissionDao,
    private readonly centreDao: CentreDao,
    private readonly logger: AppLogger,
  ) { }

  /**
   * Resolve the owning centre + scope for a role being created/updated by the
   * given actor.
   * - Centre-scoped actor (Centre Admin) → role is forced to their own centre
   *   and access_scope 'centre'; they can never create a global (Super Admin) role.
   * - Global actor (Super Admin) → global role ⇒ center_id NULL; centre role ⇒
   *   must supply a valid center_id.
   */
  private async resolveRoleScope(
    actor: UserContext,
    scope: AccessScope,
    payloadCentreId?: string | null,
  ): Promise<{ scope: AccessScope; centreId: string | null }> {
    if (!isGlobalScope(actor.user.access_scope)) {
      const actorCentre = actor.user.center_id ?? null;
      if (!actorCentre) {
        throw new ForbiddenException('Your account is not assigned to a centre.');
      }
      if (isGlobalScope(scope)) {
        throw new ForbiddenException('You are not allowed to create a global (Super Admin) role.');
      }
      return { scope: 'centre', centreId: actorCentre };
    }
    // Global actor.
    if (isGlobalScope(scope)) {
      return { scope: 'global', centreId: null };
    }
    const trimmed = payloadCentreId?.trim();
    if (!trimmed) {
      throw new BadRequestException('center_id is required for a centre-scoped role.');
    }
    const centre = await this.centreDao.findActiveById(trimmed);
    if (!centre) {
      throw new ResourceNotFoundException('Centre', trimmed);
    }
    return { scope: 'centre', centreId: centre.id };
  }

  /**
   * A centre-scoped actor may only manage roles that belong to their own centre;
   * global (Super Admin) roles are off-limits. Global actors are unrestricted.
   */
  private assertActorCanManageRole(actor: UserContext, role: Role): void {
    if (isGlobalScope(actor.user.access_scope)) {
      return;
    }
    const actorCentre = actor.user.center_id ?? null;
    if (!actorCentre) {
      throw new ForbiddenException('Your account is not assigned to a centre.');
    }
    if (isGlobalScope(role.access_scope) || (role.center_id ?? null) !== actorCentre) {
      throw new ForbiddenException('You can only manage roles in your own centre.');
    }
  }

  async create(dto: CreateRoleDto, actor: UserContext): Promise<RoleDto> {
    this.logger.log(`Creating role: ${dto.role_name}`, RolesService.context);

    try {
      const { scope, centreId } = await this.resolveRoleScope(
        actor,
        dto.access_scope ?? DEFAULT_ACCESS_SCOPE,
        dto.center_id,
      );

      // Role names are unique within their owning centre (or among global roles).
      const existing = await this.roleDao.findByRoleNameInScope(dto.role_name, centreId);
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
        access_scope: scope,
        center_id: centreId,
        // Admin rank only applies to centre scope; global roles are never a "centre admin".
        is_center_admin: scope === 'centre' ? (dto.is_center_admin ?? false) : false,
        created_by: getCreatedById(actor),
      });
      const saved = await this.roleDao.save(role);
      return this.findOne(saved.id);
    } catch (error) {
      if (
        error instanceof DuplicateResourceException ||
        error instanceof ResourceNotFoundException ||
        error instanceof ForbiddenException ||
        error instanceof BadRequestException
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

  async findAll(query: PaginationQueryDto, actor: UserContext): Promise<PaginatedResult<RoleDto>> {
    // Super Admin sees all roles; a Centre Admin sees only their own centre's roles.
    const centreScope = isGlobalScope(actor.user.access_scope)
      ? undefined
      : { centreId: actor.user.center_id ?? '' };
    const result = await this.roleDao.findPaginated(query, centreScope);
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

  async update(id: string, dto: UpdateRoleDto, actor: UserContext): Promise<RoleDto> {
    const row = await this.roleDao.findActiveById(id);
    if (!row) {
      throw new ResourceNotFoundException('Role', id);
    }

    // Centre Admins can only edit their own centre's roles (never global roles).
    this.assertActorCanManageRole(actor, row);
    if (!isGlobalScope(actor.user.access_scope) && isGlobalScope(dto.access_scope)) {
      throw new ForbiddenException('You are not allowed to set a role to global (Super Admin).');
    }

    // Resolve the owning centre of the resulting role. Only a global actor
    // (Super Admin) can set/change it; a centre actor stays locked to their centre.
    const effectiveScope = dto.access_scope ?? row.access_scope;
    let nextCentreId: string | null = row.center_id ?? null;
    if (isGlobalScope(actor.user.access_scope)) {
      if (isGlobalScope(effectiveScope)) {
        nextCentreId = null;
      } else if (dto.center_id !== undefined) {
        const trimmed = dto.center_id?.trim();
        if (trimmed) {
          const centre = await this.centreDao.findActiveById(trimmed);
          if (!centre) {
            throw new ResourceNotFoundException('Centre', trimmed);
          }
          nextCentreId = centre.id;
        } else {
          nextCentreId = null;
        }
      }
      if (!isGlobalScope(effectiveScope) && !nextCentreId) {
        throw new BadRequestException('center_id is required for a centre-scoped role.');
      }
    }

    if (dto.role_name && dto.role_name.trim() !== row.role_name) {
      // Uniqueness is per owning centre (the resulting centre).
      const duplicate = await this.roleDao.findByRoleNameInScope(dto.role_name, nextCentreId);
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

    // Global roles are never a centre admin; centre roles keep/override the rank.
    const nextIsCenterAdmin =
      effectiveScope === 'centre'
        ? (dto.is_center_admin ?? row.is_center_admin)
        : false;

    const merged = this.roleDao.merge(row, {
      ...(dto.role_name !== undefined ? { role_name: dto.role_name.trim() } : {}),
      ...(dto.permission_id !== undefined ? { permission_id: dto.permission_id } : {}),
      ...(dto.description !== undefined ? { description: dto.description?.trim() } : {}),
      ...(dto.access_scope !== undefined ? { access_scope: dto.access_scope } : {}),
      is_center_admin: nextIsCenterAdmin,
      center_id: nextCentreId,
    });
    await this.roleDao.save(merged);
    return this.findOne(id);
  }

  async remove(id: string, actor: UserContext): Promise<void> {
    const entity = await this.roleDao.findActiveById(id);
    if (!entity) {
      throw new ResourceNotFoundException('Role', id);
    }

    // Centre Admins can only delete their own centre's roles (never global roles).
    this.assertActorCanManageRole(actor, entity);

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
      access_scope: row.access_scope,
      is_center_admin: row.is_center_admin,
      center_id: row.center_id ?? null,
      center_name: row.centre?.name ?? null,
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
