import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  CreateRoleDto,
  RoleDto,
  UpdateRoleDto,
} from '../../../common/dto/role.dto';
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
import {
  AccessScope,
  DEFAULT_ACCESS_SCOPE,
  isGlobalScope,
} from '../../../common/constants/access-scope';
import { PermissionDao } from '../../database/dao/permission.dao';
import { RoleDao } from '../../database/dao/role.dao';
import { CentreDao } from '../../database/dao/centre.dao';
import { RoleCentreMappingDao } from '../../database/dao/role-centre-mapping.dao';
import { UserSessionsDao } from '../../database/dao/user-sessions.dao';
import { Role } from '../../database/entity/role.entity';
import { patchAuditContext } from '../../../common/audit/audit-context';
import { stashAuditEntityDetails } from '../../../common/audit/audit-entity-details.stash';
import { formatAccessModulesLabel } from '../../../common/auth/role-permissions';
import type { RoleAccessMatrix } from '../../../common/types/role-access.types';
import { validateAccessMatrix } from '../../../common/utils/validate-access-matrix';

type RoleAuditDetails = {
  role_type_label?: string | null;
  centre_label?: string | null;
  centre_ids?: string[] | null;
  permission_name?: string | null;
  access_modules?: string | null;
};

@Injectable()
export class RolesService {
  private static readonly context = 'RolesService';

  constructor(
    private readonly roleDao: RoleDao,
    private readonly permissionDao: PermissionDao,
    private readonly centreDao: CentreDao,
    private readonly roleCentreMappingDao: RoleCentreMappingDao,
    private readonly userSessionsDao: UserSessionsDao,
    private readonly logger: AppLogger,
  ) {}

  /**
   * Resolve the linked centres + scope for a role being created/updated by
   * the given actor. Role↔Centre is many-to-many (role_centre_mappings).
   * - Centre-scoped actor (Centre Admin) → role is forced to their own one
   *   centre and access_scope 'centre'; they can never create a global
   *   (Super Admin) role, and never see/use the multi-select.
   * - Global actor (Super Admin) → global role ⇒ no linked centres; centre
   *   role ⇒ must supply at least one valid centre id (multi-select).
   */
  private async resolveRoleScope(
    actor: UserContext,
    scope: AccessScope,
    payloadCentreIds?: string[],
  ): Promise<{ scope: AccessScope; centreIds: string[] }> {
    if (!isGlobalScope(actor.user.access_scope)) {
      const actorCentre = actor.user.center_id ?? null;
      if (!actorCentre) {
        throw new ForbiddenException(
          'Your account is not assigned to a centre.',
        );
      }
      if (isGlobalScope(scope)) {
        throw new ForbiddenException(
          'You are not allowed to create a global (Super Admin) role.',
        );
      }
      return { scope: 'centre', centreIds: [actorCentre] };
    }
    // Global actor.
    if (isGlobalScope(scope)) {
      return { scope: 'global', centreIds: [] };
    }
    const centreIds = [
      ...new Set(
        (payloadCentreIds ?? []).map((id) => id.trim()).filter(Boolean),
      ),
    ];
    if (!centreIds.length) {
      throw new BadRequestException(
        'At least one centre is required for a centre-scoped role.',
      );
    }
    for (const centreId of centreIds) {
      const centre = await this.centreDao.findActiveById(centreId);
      if (!centre) {
        throw new ResourceNotFoundException('Centre', centreId);
      }
    }
    return { scope: 'centre', centreIds };
  }

  /**
   * A centre-scoped actor may only manage roles linked to their own centre;
   * global (Super Admin) roles are off-limits. Global actors are unrestricted.
   */
  private async assertActorCanManageRole(
    actor: UserContext,
    role: Role,
  ): Promise<void> {
    if (isGlobalScope(actor.user.access_scope)) {
      return;
    }
    const actorCentre = actor.user.center_id ?? null;
    if (!actorCentre) {
      throw new ForbiddenException('Your account is not assigned to a centre.');
    }
    if (isGlobalScope(role.access_scope)) {
      throw new ForbiddenException(
        'You can only manage roles in your own centre.',
      );
    }
    const mappings = await this.roleCentreMappingDao.findActiveByRoleId(
      role.id,
    );
    const isMember = mappings.some((m) => m.centre_id === actorCentre);
    if (!isMember) {
      throw new ForbiddenException(
        'You can only manage roles in your own centre.',
      );
    }
  }

  async create(dto: CreateRoleDto, actor: UserContext): Promise<RoleDto> {
    this.logger.log(`Creating role: ${dto.role_name}`, RolesService.context);

    try {
      const { scope, centreIds } = await this.resolveRoleScope(
        actor,
        dto.access_scope ?? DEFAULT_ACCESS_SCOPE,
        dto.center_ids,
      );

      // Role names are unique globally now — create once, link many centres.
      const existing = await this.roleDao.findByRoleName(dto.role_name);
      if (existing) {
        throw new DuplicateResourceException(
          'Role',
          'role_name',
          dto.role_name,
        );
      }

      const permission = await this.permissionDao.findActiveById(
        dto.permission_id,
      );
      if (!permission) {
        throw new ResourceNotFoundException('Permission', dto.permission_id);
      }

      const permissionInUse = await this.roleDao.findByPermissionId(
        dto.permission_id,
      );
      if (permissionInUse) {
        throw new DuplicateResourceException(
          'Role',
          'permission_id',
          `already linked to role "${permissionInUse.role_name}"`,
        );
      }

      const createdBy = getCreatedById(actor);
      const isCenterAdmin =
        scope === 'centre' ? (dto.is_center_admin ?? false) : false;
      const role = this.roleDao.create({
        id: generateSnowflakeId(),
        role_name: dto.role_name.trim(),
        permission_id: permission.id,
        description: dto.description?.trim(),
        access_scope: scope,
        // Admin rank only applies to centre scope; global roles are never a "centre admin".
        is_center_admin: isCenterAdmin,
        created_by: createdBy,
      });

      const auditDetails = await this.resolveRoleAuditDetails({
        accessScope: scope,
        isCenterAdmin,
        centreIds,
        permissionId: permission.id,
        permissionName: permission.name,
        permissionAccess: permission.access,
      });
      Object.assign(role, auditDetails);
      patchAuditContext({ roleAuditDetails: { ...auditDetails } });
      stashAuditEntityDetails('Role', role.id, { after: { ...auditDetails } });

      let saved: Role;
      try {
        saved = await this.roleDao.save(role);
      } finally {
        patchAuditContext({
          roleAuditDetails: null,
          roleAuditDetailsBefore: null,
        });
      }
      await this.roleCentreMappingDao.syncForRole(
        saved.id,
        centreIds,
        createdBy,
      );
      return this.findOne(saved.id, actor);
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

  async findAll(
    query: PaginationQueryDto,
    actor: UserContext,
  ): Promise<PaginatedResult<RoleDto>> {
    // Super Admin sees all roles; a Centre Admin sees only roles linked to
    // their own centre (via role_centre_mappings).
    const centreScope = isGlobalScope(actor.user.access_scope)
      ? undefined
      : { centreId: actor.user.center_id ?? '' };
    const result = await this.roleDao.findPaginated(query, centreScope);

    const mappingsByRole = await this.loadMappingsByRoleId(
      result.data.map((row) => row.id),
    );
    return {
      ...result,
      data: result.data.map((row) =>
        this.toDto(row, mappingsByRole.get(row.id) ?? [], actor),
      ),
    };
  }

  async findOne(id: string, actor?: UserContext): Promise<RoleDto> {
    const row = await this.roleDao.findActiveByIdWithPermission(id);
    if (!row) {
      throw new ResourceNotFoundException('Role', id);
    }
    const mappings = await this.roleCentreMappingDao.findActiveByRoleId(id);
    return this.toDto(row, mappings, actor);
  }

  async findByRoleName(
    roleName: string,
    actor?: UserContext,
  ): Promise<RoleDto> {
    const row = await this.roleDao.findByRoleName(roleName);
    if (!row) {
      throw new ResourceNotFoundException('Role', roleName);
    }
    return this.findOne(row.id, actor);
  }

  async update(
    id: string,
    dto: UpdateRoleDto,
    actor: UserContext,
  ): Promise<RoleDto> {
    const row = await this.roleDao.findActiveById(id);
    if (!row) {
      throw new ResourceNotFoundException('Role', id);
    }

    // Centre Admins can only edit their own centre's roles (never global roles).
    await this.assertActorCanManageRole(actor, row);
    if (
      !isGlobalScope(actor.user.access_scope) &&
      isGlobalScope(dto.access_scope)
    ) {
      throw new ForbiddenException(
        'You are not allowed to set a role to global (Super Admin).',
      );
    }

    // Resolve the linked centres of the resulting role. Only a global actor
    // (Super Admin) can set/change them; a centre actor stays locked to
    // their one centre.
    const effectiveScope = dto.access_scope ?? row.access_scope;
    const existingMappings =
      await this.roleCentreMappingDao.findActiveByRoleId(id);
    const centreIdsBefore = existingMappings.map((m) => m.centre_id);
    let nextCentreIds = [...centreIdsBefore];

    if (isGlobalScope(actor.user.access_scope)) {
      if (isGlobalScope(effectiveScope)) {
        nextCentreIds = [];
      } else if (dto.center_ids !== undefined) {
        nextCentreIds = [
          ...new Set(dto.center_ids.map((cid) => cid.trim()).filter(Boolean)),
        ];
        for (const centreId of nextCentreIds) {
          const centre = await this.centreDao.findActiveById(centreId);
          if (!centre) {
            throw new ResourceNotFoundException('Centre', centreId);
          }
        }
      }
      if (!isGlobalScope(effectiveScope) && nextCentreIds.length === 0) {
        throw new BadRequestException(
          'At least one centre is required for a centre-scoped role.',
        );
      }
    }

    if (dto.role_name && dto.role_name.trim() !== row.role_name) {
      // Uniqueness is global now.
      const duplicate = await this.roleDao.findByRoleName(dto.role_name);
      if (duplicate && duplicate.id !== id) {
        throw new DuplicateResourceException(
          'Role',
          'role_name',
          dto.role_name,
        );
      }
    }

    if (dto.permission_id && dto.permission_id !== row.permission_id) {
      const permission = await this.permissionDao.findActiveById(
        dto.permission_id,
      );
      if (!permission) {
        throw new ResourceNotFoundException('Permission', dto.permission_id);
      }
      const permissionInUse = await this.roleDao.findByPermissionId(
        dto.permission_id,
      );
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

    // TypeORM merge mutates `row` in place — snapshot before-state first so
    // audit "before" details are not overwritten with the incoming DTO values.
    const accessScopeBefore = row.access_scope;
    const isCenterAdminBefore = row.is_center_admin;
    const permissionIdBefore = row.permission_id;
    const roleNameBefore = row.role_name;

    const merged = this.roleDao.merge(row, {
      ...(dto.role_name !== undefined
        ? { role_name: dto.role_name.trim() }
        : {}),
      ...(dto.permission_id !== undefined
        ? { permission_id: dto.permission_id }
        : {}),
      ...(dto.description !== undefined
        ? { description: dto.description?.trim() }
        : {}),
      ...(dto.access_scope !== undefined
        ? { access_scope: dto.access_scope }
        : {}),
      is_center_admin: nextIsCenterAdmin,
    });

    const linkedPermission =
      await this.permissionDao.findActiveById(permissionIdBefore);
    if (!linkedPermission) {
      throw new ResourceNotFoundException('Permission', permissionIdBefore);
    }

    const permissionAccessBefore: RoleAccessMatrix = linkedPermission.access;
    const effectivePermissionId = merged.permission_id;

    let permissionToUpdate = linkedPermission;
    if (dto.permission_id && dto.permission_id !== permissionIdBefore) {
      const switchedPermission = await this.permissionDao.findActiveById(
        dto.permission_id,
      );
      if (!switchedPermission) {
        throw new ResourceNotFoundException('Permission', dto.permission_id);
      }
      permissionToUpdate = switchedPermission;
    }

    let permissionAccessAfter: RoleAccessMatrix = permissionToUpdate.access;
    let permissionNameAfter = permissionToUpdate.name;

    const shouldUpdatePermissionProfile =
      dto.access !== undefined ||
      (dto.role_name !== undefined && dto.role_name.trim() !== roleNameBefore);

    if (shouldUpdatePermissionProfile) {
      const nextAccess =
        dto.access !== undefined
          ? validateAccessMatrix(dto.access)
          : permissionToUpdate.access;
      const nextName =
        dto.role_name !== undefined
          ? `${dto.role_name.trim()} Access`
          : permissionToUpdate.name;

      const mergedPermission = this.permissionDao.merge(permissionToUpdate, {
        access: nextAccess,
        name: nextName,
      });
      await this.permissionDao.save(mergedPermission);
      permissionAccessAfter = mergedPermission.access;
      permissionNameAfter = mergedPermission.name;

      if (dto.access !== undefined) {
        await this.userSessionsDao.deleteByPermissionId(effectivePermissionId);
        // Touch updated_at so the Role audit subscriber runs when only
        // permissions changed (no other role columns differ).
        merged.updated_at = new Date();
      }
    }

    const [beforeDetails, afterDetails] = await Promise.all([
      this.resolveRoleAuditDetails({
        accessScope: accessScopeBefore,
        isCenterAdmin: isCenterAdminBefore,
        centreIds: centreIdsBefore,
        permissionId: permissionIdBefore,
        permissionAccess: permissionAccessBefore,
      }),
      this.resolveRoleAuditDetails({
        accessScope: effectiveScope,
        isCenterAdmin: nextIsCenterAdmin,
        centreIds: nextCentreIds,
        permissionId: merged.permission_id,
        permissionName: permissionNameAfter,
        permissionAccess: permissionAccessAfter,
      }),
    ]);
    Object.assign(merged, afterDetails);
    patchAuditContext({
      roleAuditDetails: { ...afterDetails },
      roleAuditDetailsBefore: { ...beforeDetails },
    });
    stashAuditEntityDetails('Role', merged.id, {
      after: { ...afterDetails },
      before: { ...beforeDetails },
    });

    try {
      await this.roleDao.save(merged);
    } finally {
      patchAuditContext({
        roleAuditDetails: null,
        roleAuditDetailsBefore: null,
      });
    }
    await this.roleCentreMappingDao.syncForRole(
      id,
      nextCentreIds,
      getCreatedById(actor),
    );
    return this.findOne(id, actor);
  }

  async remove(id: string, actor: UserContext): Promise<void> {
    const entity = await this.roleDao.findActiveById(id);
    if (!entity) {
      throw new ResourceNotFoundException('Role', id);
    }

    // Centre Admins can only delete their own centre's roles (never global roles).
    await this.assertActorCanManageRole(actor, entity);

    const userCount = await this.roleDao.countActiveUsersByRoleId(id);
    if (userCount > 0) {
      throw new ErrorException(
        'FORBIDDEN_REQUEST',
        `Cannot delete role: ${userCount} user(s) are still assigned.`,
      );
    }

    const mappings = await this.roleCentreMappingDao.findActiveByRoleId(id);
    const resolvedDetails = await this.resolveRoleAuditDetails({
      accessScope: entity.access_scope,
      isCenterAdmin: entity.is_center_admin,
      centreIds: mappings.map((m) => m.centre_id),
      permissionId: entity.permission_id,
    });
    Object.assign(entity, resolvedDetails);
    entity.is_deleted = true;
    patchAuditContext({ roleAuditDetails: { ...resolvedDetails } });
    stashAuditEntityDetails('Role', entity.id, {
      after: { ...resolvedDetails },
    });
    try {
      await this.roleDao.save(entity);
    } finally {
      patchAuditContext({
        roleAuditDetails: null,
        roleAuditDetailsBefore: null,
      });
    }
    await this.roleCentreMappingDao.softDeleteByRoleId(id);
  }

  private async loadMappingsByRoleId(
    roleIds: string[],
  ): Promise<
    Map<
      string,
      { id: string; centre_id: string; centre?: { centre_name: string } }[]
    >
  > {
    const mappings =
      await this.roleCentreMappingDao.findActiveByRoleIds(roleIds);
    const byRole = new Map<
      string,
      { id: string; centre_id: string; centre?: { centre_name: string } }[]
    >();
    for (const mapping of mappings) {
      const list = byRole.get(mapping.role_id) ?? [];
      list.push(mapping);
      byRole.set(mapping.role_id, list);
    }
    return byRole;
  }

  private resolveRoleTypeLabel(
    scope: AccessScope,
    isCenterAdmin: boolean,
  ): string {
    if (isGlobalScope(scope)) {
      return 'Super Admin';
    }
    if (isCenterAdmin) {
      return 'Centre Admin';
    }
    return 'Centre User';
  }

  private async resolveCentreLabel(centreIds: string[]): Promise<string> {
    if (!centreIds.length) {
      return 'Global';
    }
    const names: string[] = [];
    for (const centreId of centreIds) {
      const centre = await this.centreDao.findActiveById(centreId);
      if (centre?.centre_name) {
        names.push(centre.centre_name);
      }
    }
    return names.length ? names.join(', ') : 'Global';
  }

  private async resolveRoleAuditDetails(input: {
    accessScope: AccessScope;
    isCenterAdmin: boolean;
    centreIds: string[];
    permissionId: string;
    permissionName?: string | null;
    permissionAccess?: RoleAccessMatrix | null;
  }): Promise<RoleAuditDetails> {
    let permissionName = input.permissionName ?? null;
    let permissionAccess = input.permissionAccess ?? null;
    if ((!permissionName || !permissionAccess) && input.permissionId) {
      const permission = await this.permissionDao.findActiveById(
        input.permissionId,
      );
      if (!permissionName) {
        permissionName = permission?.name ?? null;
      }
      if (!permissionAccess) {
        permissionAccess = permission?.access ?? null;
      }
    }

    return {
      role_type_label: this.resolveRoleTypeLabel(
        input.accessScope,
        input.isCenterAdmin,
      ),
      centre_label: await this.resolveCentreLabel(input.centreIds),
      centre_ids: input.centreIds.length ? [...input.centreIds] : null,
      permission_name: permissionName,
      access_modules: permissionAccess
        ? formatAccessModulesLabel(permissionAccess)
        : null,
    };
  }

  /**
   * Builds the response DTO. Centre-scoped viewers must never see other
   * centres a shared role happens to be linked to — only their own (if
   * present) is included. Global viewers (or internal/no-actor calls) see
   * every linked centre.
   */
  private toDto(
    row: Role,
    mappings: {
      id: string;
      centre_id: string;
      centre?: { centre_name: string };
    }[],
    actor?: UserContext,
  ): RoleDto {
    const actorCentre =
      actor && !isGlobalScope(actor.user.access_scope)
        ? (actor.user.center_id ?? null)
        : null;
    const visibleMappings = actorCentre
      ? mappings.filter((m) => m.centre_id === actorCentre)
      : mappings;

    return {
      id: row.id,
      role_id: row.role_id,
      role_name: row.role_name,
      permission_id: row.permission_id,
      description: row.description,
      access_scope: row.access_scope,
      is_center_admin: row.is_center_admin,
      centres: visibleMappings.map((m) => ({
        id: m.centre_id,
        name: m.centre?.centre_name ?? '',
      })),
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
