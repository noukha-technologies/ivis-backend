import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import { AppLogger } from '../../../common/logger/app.logger';
import { getCreatedById } from '../../../common/utils/created-by.util';
import { normalizeUserCode } from '../../../common/utils/normalize-user-code.util';
import {
  DEFAULT_ACCESS_SCOPE,
  isGlobalScope,
} from '../../../common/constants/access-scope';
import { generateSnowflakeId } from '../../../common/shared/snowflakeIdGeneration';
import {
  mapUserToResponse,
  UserResponse,
} from '../../../common/utils/map-user-response';
import { resolveUserLineIds } from '../../../common/validators/user-centre-line.validator';

import type { UserContext } from '../../../common/dto/auth.dto';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { CreateUserDto, UpdateUserDto } from '../../../common/dto/user.dto';

import { IUsersService } from './user.service.interface';
import { PaginatedResult } from '../../../common/interfaces/pagination.interface';
import { MasterScopeService } from '../../../common/services/master-scope.service';

import {
  DatabaseException,
  DuplicateResourceException,
  ResourceNotFoundException,
} from '../../../common/exceptions/custom.exception';

import { RoleDao } from '../../database/dao/role.dao';
import { UsersDao } from '../../database/dao/users.dao';
import { UserLineMappingDao } from '../../database/dao/user-line-mapping.dao';

@Injectable()
export class UsersService implements IUsersService {
  private static readonly context = 'UsersService';
  constructor(
    private readonly roleDao: RoleDao,
    private readonly logger: AppLogger,
    private readonly usersDao: UsersDao,
    private readonly masterScope: MasterScopeService,
    private readonly userLineMappingDao: UserLineMappingDao,
  ) {}

  async create(
    createUserDto: CreateUserDto,
    actor: UserContext,
  ): Promise<UserResponse> {
    this.logger.log(
      `Creating user with email: ${createUserDto.email}`,
      UsersService.context,
    );

    try {
      const existingEmail = await this.usersDao.findByEmailIgnoringDelete(
        createUserDto.email,
      );
      if (existingEmail) {
        throw new DuplicateResourceException(
          'User',
          'email',
          createUserDto.email,
        );
      }

      const trimmedUserCode = normalizeUserCode(createUserDto.user_code);
      const existingCode =
        await this.usersDao.findByUserCodeIgnoringDelete(trimmedUserCode);
      if (existingCode) {
        throw new DuplicateResourceException(
          'User',
          'user_code',
          trimmedUserCode,
        );
      }

      const role = await this.roleDao.findActiveById(createUserDto.role_id);
      if (!role) {
        throw new ResourceNotFoundException('Role', createUserDto.role_id);
      }

      const lineIds = this.normalizeLineIds(resolveUserLineIds(createUserDto));
      const centreFkId = await this.resolveCentreForUser(
        createUserDto.center_id,
        lineIds,
      );
      // Centre/line requirements by role type:
      //  Super Admin (global)      → centre required, line optional
      //  Centre Admin (centre+adm) → centre required, line optional
      //  Centre User  (centre)     → centre required, line required
      const isGlobal = isGlobalScope(role.access_scope);
      if (!centreFkId) {
        throw new BadRequestException('Centre is required.');
      }
      if (!isGlobal && !role.is_center_admin && lineIds.length === 0) {
        throw new BadRequestException(
          'At least one line is required for a Centre User.',
        );
      }
      // Centre-scoped actors can only create non-Super-Admin users in their centre.
      this.assertActorCanManage(actor, centreFkId, role.access_scope);
      if (centreFkId) {
        await this.masterScope.assertLinesBelongToCentre(lineIds, centreFkId);
      }

      const {
        password,
        role_id: _roleId,
        center_id: _centerId,
        line_ids: _lineIds,
        line_id: _lineId,
        user_code: _userCode,
        ...userFields
      } = createUserDto;

      const nextUserId = await this.usersDao.getNextUserId();
      const createdBy = getCreatedById(actor);

      const user = this.usersDao.create({
        id: generateSnowflakeId(),
        ...userFields,
        user_id: nextUserId,
        user_code: trimmedUserCode,
        role_id: role.id,
        center_id: centreFkId ?? null,
        password,
        created_by: createdBy,
      });
      const savedUser = await this.usersDao.save(user);

      if (lineIds.length > 0) {
        await this.userLineMappingDao.replaceForUser(
          savedUser.id,
          lineIds,
          createdBy,
        );
      }

      this.logger.log(
        `User created with ID: ${savedUser.id}`,
        UsersService.context,
      );
      return this.findOne(savedUser.id);
    } catch (error) {
      if (
        error instanceof DuplicateResourceException ||
        error instanceof ResourceNotFoundException ||
        error instanceof BadRequestException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to create user: ${(error as Error).message}`,
        (error as Error).stack,
        UsersService.context,
      );
      throw new DatabaseException('Failed to create user. Please try again.');
    }
  }

  async findAll(
    query: PaginationQueryDto,
    actor: UserContext,
  ): Promise<PaginatedResult<UserResponse>> {
    this.logger.log(
      `Fetching users — page: ${query.page}, limit: ${query.limit}`,
      UsersService.context,
    );

    try {
      // Super Admin sees everyone; a centre-scoped actor sees only their own
      // centre's users (Super Admins excluded).
      const centreScope = isGlobalScope(actor.user.access_scope)
        ? undefined
        : { centreId: actor.user.center_id ?? '' };
      const result = await this.usersDao.findPaginated(query, centreScope);
      return {
        ...result,
        data: result.data.map(mapUserToResponse),
      };
    } catch (error) {
      this.logger.error(
        `Failed to fetch users: ${(error as Error).message}`,
        (error as Error).stack,
        UsersService.context,
      );
      throw new DatabaseException('Failed to fetch users. Please try again.');
    }
  }

  async findOne(id: string): Promise<UserResponse> {
    this.logger.log(`Fetching user ID: ${id}`, UsersService.context);

    try {
      const user = await this.usersDao.findActiveById(id);
      if (!user) {
        throw new ResourceNotFoundException('User', id);
      }
      return mapUserToResponse(user);
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to fetch user: ${(error as Error).message}`,
        (error as Error).stack,
        UsersService.context,
      );
      throw new DatabaseException('Failed to fetch user. Please try again.');
    }
  }

  async findByEmail(email: string): Promise<UserResponse | null> {
    this.logger.log(`Lookup by email: ${email}`, UsersService.context);

    try {
      const user = await this.usersDao.findByEmail(email);
      return user ? mapUserToResponse(user) : null;
    } catch (error) {
      this.logger.error(
        `Failed to find user by email: ${(error as Error).message}`,
        (error as Error).stack,
        UsersService.context,
      );
      throw new DatabaseException('Failed to look up user by email.');
    }
  }

  async update(
    id: string,
    updateUserDto: UpdateUserDto,
    actor: UserContext,
  ): Promise<UserResponse> {
    this.logger.log(`Updating user ID: ${id}`, UsersService.context);

    try {
      const user = await this.usersDao.findActiveById(id);
      if (!user) {
        throw new ResourceNotFoundException('User', id);
      }

      // Actor must be allowed to manage this target user in its current state.
      this.assertActorCanManage(actor, user.center_id, user.role?.access_scope);

      if (updateUserDto.email && updateUserDto.email !== user.email) {
        const existingEmail = await this.usersDao.findByEmailIgnoringDelete(
          updateUserDto.email,
        );
        if (existingEmail && existingEmail.id !== id) {
          throw new DuplicateResourceException(
            'User',
            'email',
            updateUserDto.email,
          );
        }
      }

      let normalizedUserCode: string | undefined;
      if (updateUserDto.user_code !== undefined) {
        normalizedUserCode = normalizeUserCode(updateUserDto.user_code);
        if (normalizedUserCode !== user.user_code) {
          const existingCode =
            await this.usersDao.findByUserCodeIgnoringDelete(
              normalizedUserCode,
            );
          if (existingCode && existingCode.id !== id) {
            throw new DuplicateResourceException(
              'User',
              'user_code',
              normalizedUserCode,
            );
          }
        }
      }

      const {
        role_id: updatedRoleId,
        center_id,
        line_ids,
        line_id,
        user_code: _userCode,
        ...updateFields
      } = updateUserDto;
      const hasLinesUpdate = line_ids !== undefined || line_id !== undefined;
      const resolvedLineIds = hasLinesUpdate
        ? this.normalizeLineIds(resolveUserLineIds({ line_ids, line_id }))
        : undefined;

      let roleId: string | undefined;
      let effectiveScope = user.role?.access_scope ?? DEFAULT_ACCESS_SCOPE;
      let effectiveIsCenterAdmin = user.role?.is_center_admin ?? false;
      if (updatedRoleId !== undefined) {
        const role = await this.roleDao.findActiveById(updatedRoleId);
        if (!role) {
          throw new ResourceNotFoundException('Role', updatedRoleId);
        }
        roleId = role.id;
        effectiveScope = role.access_scope;
        effectiveIsCenterAdmin = role.is_center_admin;
      }

      let centreFkId: string | null | undefined;
      if (center_id !== undefined) {
        // Multiple users may share the same centre — no uniqueness check.
        centreFkId = await this.resolveCentreForUser(
          center_id,
          resolvedLineIds ?? [],
        );
      }

      const effectiveCentreId =
        centreFkId !== undefined ? centreFkId : (user.center_id ?? null);
      const createdBy = getCreatedById(actor);

      // Centre/line requirements by role type:
      //  Super Admin (global)      → centre required, line optional
      //  Centre Admin (centre+adm) → centre required, line optional
      //  Centre User  (centre)     → centre required, line required
      const isGlobal = isGlobalScope(effectiveScope);
      if (!effectiveCentreId) {
        throw new BadRequestException('Centre is required.');
      }
      // Actor must also be allowed to save the RESULTING state — a Centre Admin
      // cannot promote a user to Super Admin or move them to another centre.
      this.assertActorCanManage(actor, effectiveCentreId, effectiveScope);
      if (!isGlobal && !effectiveIsCenterAdmin) {
        const centreChanged =
          centreFkId !== undefined && centreFkId !== user.center_id;
        const currentLineCount = (user.lineMappings ?? []).filter(
          (m) => !m.is_deleted,
        ).length;
        const effectiveLineCount = hasLinesUpdate
          ? (resolvedLineIds?.length ?? 0)
          : centreChanged
            ? 0
            : currentLineCount;
        if (effectiveLineCount === 0) {
          throw new BadRequestException(
            'At least one line is required for a Centre User.',
          );
        }
      }

      if (hasLinesUpdate) {
        const normalizedLineIds = resolvedLineIds!;
        if (effectiveCentreId) {
          // Lines are optional (admins have none); validate only when provided.
          if (normalizedLineIds.length > 0) {
            // Lines are shareable across users — only ensure they belong to the centre.
            await this.masterScope.assertLinesBelongToCentre(
              normalizedLineIds,
              effectiveCentreId,
            );
          }
        } else if (normalizedLineIds.length > 0) {
          throw new BadRequestException(
            'Centre is required when assigning lines.',
          );
        }
        // Diff-based: only the added/removed lines change; unchanged rows are kept.
        await this.userLineMappingDao.syncForUser(
          id,
          normalizedLineIds,
          createdBy,
        );
      } else if (centreFkId !== undefined && centreFkId !== user.center_id) {
        // Centre changed but no explicit line update → clear stale line mappings.
        await this.userLineMappingDao.syncForUser(id, [], createdBy);
      }

      const mergedUser = this.usersDao.merge(user, {
        ...updateFields,
        ...(roleId !== undefined ? { role_id: roleId } : {}),
        ...(centreFkId !== undefined ? { center_id: centreFkId } : {}),
        ...(normalizedUserCode !== undefined
          ? { user_code: normalizedUserCode }
          : {}),
      });

      // Detach the loaded line-mappings collection before saving: otherwise
      // TypeORM syncs the stale (pre-update) array and deletes the rows that
      // syncForUser just wrote. Line mappings are managed only via the DAO.
      mergedUser.lineMappings = undefined;
      // Detach the stale ManyToOne relation objects too — when role_id/center_id
      // change, the previously-loaded `role`/`assignedCentre` entities would
      // otherwise overwrite the updated FK columns on save.
      if (roleId !== undefined) {
        (mergedUser as { role?: unknown }).role = undefined;
      }
      if (centreFkId !== undefined) {
        (mergedUser as { assignedCentre?: unknown }).assignedCentre = undefined;
      }
      await this.usersDao.save(mergedUser);

      this.logger.log(`User updated ID: ${id}`, UsersService.context);
      return this.findOne(id);
    } catch (error) {
      if (
        error instanceof ResourceNotFoundException ||
        error instanceof DuplicateResourceException ||
        error instanceof BadRequestException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to update user: ${(error as Error).message}`,
        (error as Error).stack,
        UsersService.context,
      );
      throw new DatabaseException('Failed to update user. Please try again.');
    }
  }

  async remove(id: string, actor: UserContext): Promise<void> {
    this.logger.log(`Deleting user ID: ${id}`, UsersService.context);

    try {
      const user = await this.usersDao.findActiveById(id);
      if (!user) {
        throw new ResourceNotFoundException('User', id);
      }
      // Centre-scoped actors can only delete users in their own centre, never a Super Admin.
      this.assertActorCanManage(actor, user.center_id, user.role?.access_scope);
      user.is_deleted = true;
      await this.usersDao.save(user);
      await this.userLineMappingDao.softDeleteByUserId(id);
      this.logger.log(`User soft-deleted ID: ${id}`, UsersService.context);
    } catch (error) {
      if (
        error instanceof ResourceNotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to delete user: ${(error as Error).message}`,
        (error as Error).stack,
        UsersService.context,
      );
      throw new DatabaseException('Failed to delete user. Please try again.');
    }
  }

  /**
   * Actor-based authorization for managing a target user.
   * - Super Admin (global actor) → unrestricted.
   * - Centre-scoped actor (e.g. Centre Admin) → may only act on users in their
   *   own centre, and never on a Super Admin (global-scope) user.
   */
  private assertActorCanManage(
    actor: UserContext,
    targetCentreId: string | null | undefined,
    targetRoleScope?: string | null,
  ): void {
    if (isGlobalScope(actor.user.access_scope)) {
      return;
    }
    const actorCentreId = actor.user.center_id ?? null;
    if (!actorCentreId) {
      throw new ForbiddenException('Your account is not assigned to a centre.');
    }
    if (isGlobalScope(targetRoleScope)) {
      throw new ForbiddenException(
        'You are not allowed to manage a Super Admin user.',
      );
    }
    if ((targetCentreId ?? null) !== actorCentreId) {
      throw new ForbiddenException(
        'You can only manage users in your own centre.',
      );
    }
  }

  private async resolveCentreForUser(
    centerId: string | null | undefined,
    lineIds: string[],
  ): Promise<string | null> {
    const trimmed = centerId?.trim();
    if (!trimmed) {
      if (lineIds.length > 0) {
        throw new BadRequestException(
          'Centre is required when assigning lines.',
        );
      }
      return null;
    }
    // Lines are optional (admins have a centre but no lines) — do not require them.
    return this.masterScope.resolveCentreId(trimmed);
  }

  private normalizeLineIds(lineIds?: string[]): string[] {
    if (!lineIds?.length) {
      return [];
    }
    return [...new Set(lineIds.map((id) => id.trim()).filter(Boolean))];
  }
}
