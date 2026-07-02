import { BadRequestException, Injectable } from '@nestjs/common';

import { AppLogger } from '../../../common/logger/app.logger';
import { getCreatedById } from '../../../common/utils/created-by.util';
import { normalizeUserCode } from '../../../common/utils/normalize-user-code.util';
import { generateSnowflakeId } from '../../../common/shared/snowflakeIdGeneration';
import { mapUserToResponse, UserResponse } from '../../../common/utils/map-user-response';
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
  ) { }

  async create(createUserDto: CreateUserDto, actor: UserContext): Promise<UserResponse> {
    this.logger.log(`Creating user with email: ${createUserDto.email}`, UsersService.context);

    try {
      const existingEmail = await this.usersDao.findByEmail(createUserDto.email);
      if (existingEmail) {
        throw new DuplicateResourceException('User', 'email', createUserDto.email);
      }

      const trimmedUserCode = normalizeUserCode(createUserDto.user_code);
      const existingCode = await this.usersDao.findByUserCode(trimmedUserCode);
      if (existingCode) {
        throw new DuplicateResourceException('User', 'user_code', trimmedUserCode);
      }

      const role = await this.roleDao.findActiveById(createUserDto.role_id);
      if (!role) {
        throw new ResourceNotFoundException('Role', createUserDto.role_id);
      }

      const lineIds = this.normalizeLineIds(resolveUserLineIds(createUserDto));
      const centreFkId = await this.resolveCentreForUser(createUserDto.center_id, lineIds);
      if (centreFkId) {
        // Multiple users may share the same centre and lines — no uniqueness check.
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
        await this.userLineMappingDao.replaceForUser(savedUser.id, lineIds, createdBy);
      }

      this.logger.log(`User created with ID: ${savedUser.id}`, UsersService.context);
      return this.findOne(savedUser.id);
    } catch (error) {
      if (
        error instanceof DuplicateResourceException ||
        error instanceof ResourceNotFoundException ||
        error instanceof BadRequestException
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

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<UserResponse>> {
    this.logger.log(
      `Fetching users — page: ${query.page}, limit: ${query.limit}`,
      UsersService.context,
    );

    try {
      const result = await this.usersDao.findPaginated(query);
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

  async update(id: string, updateUserDto: UpdateUserDto, actor: UserContext): Promise<UserResponse> {
    this.logger.log(`Updating user ID: ${id}`, UsersService.context);

    try {
      const user = await this.usersDao.findActiveById(id);
      if (!user) {
        throw new ResourceNotFoundException('User', id);
      }

      if (updateUserDto.email && updateUserDto.email !== user.email) {
        const existingEmail = await this.usersDao.findByEmail(updateUserDto.email);
        if (existingEmail) {
          throw new DuplicateResourceException('User', 'email', updateUserDto.email);
        }
      }

      let normalizedUserCode: string | undefined;
      if (updateUserDto.user_code !== undefined) {
        normalizedUserCode = normalizeUserCode(updateUserDto.user_code);
        if (normalizedUserCode !== user.user_code) {
          const existingCode = await this.usersDao.findByUserCode(normalizedUserCode);
          if (existingCode && existingCode.id !== id) {
            throw new DuplicateResourceException('User', 'user_code', normalizedUserCode);
          }
        }
      }

      const { role_id: updatedRoleId, center_id, line_ids, line_id, user_code: _userCode, ...updateFields } = updateUserDto;
      const hasLinesUpdate = line_ids !== undefined || line_id !== undefined;
      const resolvedLineIds = hasLinesUpdate
        ? this.normalizeLineIds(resolveUserLineIds({ line_ids, line_id }))
        : undefined;
      let roleId: string | undefined;
      if (updatedRoleId !== undefined) {
        const role = await this.roleDao.findActiveById(updatedRoleId);
        if (!role) {
          throw new ResourceNotFoundException('Role', updatedRoleId);
        }
        roleId = role.id;
      }

      let centreFkId: string | null | undefined;
      if (center_id !== undefined) {
        // Multiple users may share the same centre — no uniqueness check.
        centreFkId = await this.resolveCentreForUser(center_id, resolvedLineIds ?? []);
      }

      const effectiveCentreId = centreFkId !== undefined ? centreFkId : (user.center_id ?? null);
      const createdBy = getCreatedById(actor);

      if (hasLinesUpdate) {
        const normalizedLineIds = resolvedLineIds!;
        if (effectiveCentreId) {
          // Lines are optional (admins have none); validate only when provided.
          if (normalizedLineIds.length > 0) {
            // Lines are shareable across users — only ensure they belong to the centre.
            await this.masterScope.assertLinesBelongToCentre(normalizedLineIds, effectiveCentreId);
          }
        } else if (normalizedLineIds.length > 0) {
          throw new BadRequestException('Centre is required when assigning lines.');
        }
        // Diff-based: only the added/removed lines change; unchanged rows are kept.
        await this.userLineMappingDao.syncForUser(id, normalizedLineIds, createdBy);
      } else if (centreFkId !== undefined && centreFkId !== user.center_id) {
        // Centre changed but no explicit line update → clear stale line mappings.
        await this.userLineMappingDao.syncForUser(id, [], createdBy);
      }

      const mergedUser = this.usersDao.merge(user, {
        ...updateFields,
        ...(roleId !== undefined ? { role_id: roleId } : {}),
        ...(centreFkId !== undefined ? { center_id: centreFkId } : {}),
        ...(normalizedUserCode !== undefined ? { user_code: normalizedUserCode } : {}),
      });
      // Detach the loaded line-mappings collection before saving: otherwise
      // TypeORM syncs the stale (pre-update) array and deletes the rows that
      // syncForUser just wrote. Line mappings are managed only via the DAO.
      mergedUser.lineMappings = undefined;
      await this.usersDao.save(mergedUser);

      this.logger.log(`User updated ID: ${id}`, UsersService.context);
      return this.findOne(id);
    } catch (error) {
      if (
        error instanceof ResourceNotFoundException ||
        error instanceof DuplicateResourceException ||
        error instanceof BadRequestException
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

  async remove(id: string): Promise<void> {
    this.logger.log(`Deleting user ID: ${id}`, UsersService.context);

    try {
      const user = await this.usersDao.findActiveById(id);
      if (!user) {
        throw new ResourceNotFoundException('User', id);
      }
      user.is_deleted = true;
      await this.usersDao.save(user);
      await this.userLineMappingDao.softDeleteByUserId(id);
      this.logger.log(`User soft-deleted ID: ${id}`, UsersService.context);
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
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

  private async resolveCentreForUser(
    centerId: string | null | undefined,
    lineIds: string[],
  ): Promise<string | null> {
    const trimmed = centerId?.trim();
    if (!trimmed) {
      if (lineIds.length > 0) {
        throw new BadRequestException('Centre is required when assigning lines.');
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
