import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateUserDto, UpdateUserDto } from '../../../common/dto/user.dto';
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

      const normalizedUserCode = createUserDto.user_code.trim().toUpperCase();
      const existingCode = await this.usersDao.findByUserCode(normalizedUserCode);
      if (existingCode) {
        throw new DuplicateResourceException('User', 'user_code', normalizedUserCode);
      }

      const role = await this.roleDao.findActiveById(createUserDto.role_id);
      if (!role) {
        throw new ResourceNotFoundException('Role', createUserDto.role_id);
      }

      const lineIds = this.normalizeLineIds(createUserDto.line_ids);
      const centreFkId = await this.masterScope.resolveCentreId(createUserDto.center_id);
      await this.masterScope.assertCentreNotAssignedToOtherUser(centreFkId);
      await this.masterScope.assertLinesBelongToCentre(lineIds, centreFkId);
      await this.assertLinesAvailable(lineIds);

      const {
        password,
        role_id: _roleId,
        center_id: _centerId,
        line_ids: _lineIds,
        user_code: _userCode,
        ...userFields
      } = createUserDto;

      const nextUserId = await this.usersDao.getNextUserId();

      const createdBy = getCreatedById(actor);

      const user = this.usersDao.create({
        id: generateSnowflakeId(),
        ...userFields,
        user_id: nextUserId,
        user_code: normalizedUserCode,
        role_id: role.id,
        center_id: centreFkId,
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
        normalizedUserCode = updateUserDto.user_code.trim().toUpperCase();
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
        user_code: _userCode,
        ...updateFields
      } = updateUserDto;
      let roleId: string | undefined;
      if (updatedRoleId !== undefined) {
        const role = await this.roleDao.findActiveById(updatedRoleId);
        if (!role) {
          throw new ResourceNotFoundException('Role', updatedRoleId);
        }
        roleId = role.id;
      }

      let centreFkId: string | undefined;
      if (center_id !== undefined) {
        if (center_id === null || center_id === '') {
          throw new BadRequestException('center_id cannot be cleared; every user must belong to a centre.');
        }
        centreFkId = await this.masterScope.resolveCentreId(center_id);
        await this.masterScope.assertCentreNotAssignedToOtherUser(centreFkId, id);
      }

      const effectiveCentreId = centreFkId ?? user.center_id;

      const createdBy = getCreatedById(actor);

      if (line_ids !== undefined) {
        const normalizedLineIds = this.normalizeLineIds(line_ids);
        await this.masterScope.assertLinesBelongToCentre(normalizedLineIds, effectiveCentreId);
        await this.assertLinesAvailable(normalizedLineIds, id);
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
