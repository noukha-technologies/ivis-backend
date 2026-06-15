import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateUserDto, UpdateUserDto } from '../../../common/dto/user.dto';
import { resolveUserLineIds } from '../../../common/validators/user-centre-line.validator.js';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../common/interfaces/pagination.interface';
import {
  DatabaseException,
  DuplicateResourceException,
  ResourceNotFoundException,
} from '../../../common/exceptions/custom.exception';
import { AppLogger } from '../../../common/logger/app.logger';
import { generateSnowflakeId } from '../../../common/shared/snowflakeIdGeneration';
import { UserLineMappingDao } from '../../database/dao/user-line-mapping.dao';
import { UsersDao } from '../../database/dao/users.dao';
import { RoleDao } from '../../database/dao/role.dao';
import type { UserContext } from '../../../common/dto/auth.dto';
import { getCreatedById } from '../../../common/utils/created-by.util';
import { mapUserToResponse, UserResponse } from '../../../common/utils/map-user-response';
import { MasterScopeService } from '../../../common/services/master-scope.service';
import { IUsersService } from './user.service.interface';

@Injectable()
export class UsersService implements IUsersService {
  private static readonly context = 'UsersService';
  constructor(
    private readonly usersDao: UsersDao,
    private readonly roleDao: RoleDao,
    private readonly masterScope: MasterScopeService,
    private readonly userLineMappingDao: UserLineMappingDao,
    private readonly logger: AppLogger,
  ) { }

  async create(createUserDto: CreateUserDto, actor: UserContext): Promise<UserResponse> {
    this.logger.log(`Creating user with email: ${createUserDto.email}`, UsersService.context);

    try {
      const existingEmail = await this.usersDao.findByEmail(createUserDto.email);
      if (existingEmail) {
        throw new DuplicateResourceException('User', 'email', createUserDto.email);
      }

      const trimmedUserCode = createUserDto.user_code.trim();
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
        await this.masterScope.assertCentreNotAssignedToOtherUser(centreFkId);
        await this.masterScope.assertLinesBelongToCentre(lineIds, centreFkId);
        await this.assertLinesAvailable(lineIds);
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
        normalizedUserCode = updateUserDto.user_code.trim();
        if (normalizedUserCode !== user.user_code) {
          const existingCode = await this.usersDao.findByUserCode(normalizedUserCode);
          if (existingCode && existingCode.id !== id) {
            throw new DuplicateResourceException('User', 'user_code', normalizedUserCode);
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
      if (updatedRoleId !== undefined) {
        const role = await this.roleDao.findActiveById(updatedRoleId);
        if (!role) {
          throw new ResourceNotFoundException('Role', updatedRoleId);
        }
        roleId = role.id;
      }

      let centreFkId: string | null | undefined;
      if (center_id !== undefined) {
        centreFkId = await this.resolveCentreForUser(center_id, resolvedLineIds ?? []);
        if (centreFkId) {
          await this.masterScope.assertCentreNotAssignedToOtherUser(centreFkId, id);
        }
      }

      const effectiveCentreId =
        centreFkId !== undefined ? centreFkId : (user.center_id ?? null);

      const createdBy = getCreatedById(actor);

      if (hasLinesUpdate) {
        const normalizedLineIds = resolvedLineIds!;
        if (effectiveCentreId) {
          if (normalizedLineIds.length === 0) {
            throw new BadRequestException(
              'At least one line is required when a centre is assigned.',
            );
          }
          await this.masterScope.assertLinesBelongToCentre(normalizedLineIds, effectiveCentreId);
          await this.assertLinesAvailable(normalizedLineIds, id);
        } else if (normalizedLineIds.length > 0) {
          throw new BadRequestException('Centre is required when assigning lines.');
        }
        await this.userLineMappingDao.replaceForUser(id, normalizedLineIds, createdBy);
      } else if (centreFkId !== undefined && centreFkId !== user.center_id) {
        await this.userLineMappingDao.replaceForUser(id, [], createdBy);
      }

      const mergedUser = this.usersDao.merge(user, {
        ...updateFields,
        ...(roleId !== undefined ? { role_id: roleId } : {}),
        ...(centreFkId !== undefined ? { center_id: centreFkId } : {}),
        ...(normalizedUserCode !== undefined ? { user_code: normalizedUserCode } : {}),
      });
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
    if (lineIds.length === 0) {
      throw new BadRequestException('At least one line is required when a centre is assigned.');
    }
    return this.masterScope.resolveCentreId(trimmed);
  }

  private normalizeLineIds(lineIds?: string[]): string[] {
    if (!lineIds?.length) {
      return [];
    }
    return [...new Set(lineIds.map((id) => id.trim()).filter(Boolean))];
  }

  private async assertLinesAvailable(lineIds: string[], excludeUserId?: string): Promise<void> {
    if (!lineIds.length) {
      return;
    }
    const conflicts = await this.userLineMappingDao.findActiveByLineIds(lineIds);
    for (const mapping of conflicts) {
      if (excludeUserId && mapping.user_id === excludeUserId) {
        continue;
      }
      throw new DuplicateResourceException('Line', 'line_id', mapping.line_id);
    }
  }
}
