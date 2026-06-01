import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
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
import { CentreDao } from '../../database/dao/centre.dao';
import { LineDao } from '../../database/dao/line.dao';
import { UserLineMappingDao } from '../../database/dao/user-line-mapping.dao';
import { UsersDao } from '../../database/dao/users.dao';
import { RoleAccessDao } from '../../database/dao/role-access.dao';
import { mapUserToResponse, UserResponse } from '../../../common/utils/map-user-response';
import { IUsersService } from './user.service.interface';

@Injectable()
export class UsersService implements IUsersService {
  private static readonly context = 'UsersService';

  constructor(
    private readonly usersDao: UsersDao,
    private readonly roleAccessDao: RoleAccessDao,
    private readonly centreDao: CentreDao,
    private readonly lineDao: LineDao,
    private readonly userLineMappingDao: UserLineMappingDao,
    private readonly logger: AppLogger,
  ) { }

  async create(createUserDto: CreateUserDto): Promise<UserResponse> {
    this.logger.log(`Creating user with email: ${createUserDto.email}`, UsersService.context);

    try {
      const existingEmail = await this.usersDao.findByEmail(createUserDto.email);
      if (existingEmail) {
        throw new DuplicateResourceException('User', 'email', createUserDto.email);
      }

      let user_id = createUserDto.user_id;
      if (!user_id) {
        user_id = await this.usersDao.getNextUserId();
      } else {
        const existingUserId = await this.usersDao.findByUserId(user_id);
        if (existingUserId) {
          throw new DuplicateResourceException('User', 'user_id', user_id);
        }
      }

      const roleAccess = await this.roleAccessDao.findActiveById(createUserDto.role_access_id);
      if (!roleAccess) {
        throw new ResourceNotFoundException('RoleAccess', createUserDto.role_access_id);
      }

      const lineIds = this.normalizeLineIds(createUserDto.line_ids);
      await this.validateLineIds(lineIds);
      await this.assertLinesAvailable(lineIds);

      const { password, role_access_id, center_id, line_ids: _lineIds, ...userFields } =
        createUserDto;
      const password_hash = await bcrypt.hash(password, 10);

      let centreFkId: string | undefined;
      if (center_id) {
        const centre = await this.centreDao.findActiveById(center_id);
        if (!centre) {
          throw new ResourceNotFoundException('Centre', center_id);
        }
        centreFkId = centre.id;
      }

      const user = this.usersDao.create({
        id: generateSnowflakeId(),
        ...userFields,
        user_id,
        role_access_id: roleAccess.id,
        center_id: centreFkId,
        password: password_hash,
      });
      const savedUser = await this.usersDao.save(user);

      if (lineIds.length > 0) {
        await this.userLineMappingDao.replaceForUser(
          savedUser.id,
          lineIds,
          createUserDto.created_by,
        );
      }

      this.logger.log(`User created with ID: ${savedUser.id}`, UsersService.context);
      return this.findOne(savedUser.id);
    } catch (error) {
      if (
        error instanceof DuplicateResourceException ||
        error instanceof ResourceNotFoundException
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

  async update(id: string, updateUserDto: UpdateUserDto): Promise<UserResponse> {
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

      const { role_access_id: updatedRoleAccessId, center_id, line_ids, ...updateFields } =
        updateUserDto;
      let roleAccessId: string | undefined;
      if (updatedRoleAccessId !== undefined) {
        const roleAccess = await this.roleAccessDao.findActiveById(updatedRoleAccessId);
        if (!roleAccess) {
          throw new ResourceNotFoundException('RoleAccess', updatedRoleAccessId);
        }
        roleAccessId = roleAccess.id;
      }

      let centreFkId: string | null | undefined;
      if (center_id !== undefined) {
        if (center_id === null || center_id === '') {
          centreFkId = null;
        } else {
          const centre = await this.centreDao.findActiveById(center_id);
          if (!centre) {
            throw new ResourceNotFoundException('Centre', center_id);
          }
          centreFkId = centre.id;
        }
      }

      if (line_ids !== undefined) {
        const normalizedLineIds = this.normalizeLineIds(line_ids);
        await this.validateLineIds(normalizedLineIds);
        await this.assertLinesAvailable(normalizedLineIds, id);
        await this.userLineMappingDao.replaceForUser(id, normalizedLineIds, user.created_by);
      }

      const mergedUser = this.usersDao.merge(user, {
        ...updateFields,
        ...(roleAccessId !== undefined ? { role_access_id: roleAccessId } : {}),
        ...(centreFkId !== undefined ? { center_id: centreFkId } : {}),
      });
      await this.usersDao.save(mergedUser);

      this.logger.log(`User updated ID: ${id}`, UsersService.context);
      return this.findOne(id);
    } catch (error) {
      if (
        error instanceof ResourceNotFoundException ||
        error instanceof DuplicateResourceException
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

  private async validateLineIds(lineIds: string[]): Promise<void> {
    for (const lineId of lineIds) {
      const line = await this.lineDao.findActiveById(lineId);
      if (!line) {
        throw new ResourceNotFoundException('Line', lineId);
      }
    }
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
