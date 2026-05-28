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
import { User } from '../../database/entity/user.entity';
import { CentreDao } from '../../database/dao/centre.dao';
import { LineDao } from '../../database/dao/line.dao';
import { UsersDao } from '../../database/dao/users.dao';
import { RolesDao } from '../../database/dao/roles.dao';
import { IUsersService } from './user.service.interface';

@Injectable()
export class UsersService implements IUsersService {
  private static readonly context = 'UsersService';

  constructor(
    private readonly usersDao: UsersDao,
    private readonly rolesDao: RolesDao,
    private readonly centreDao: CentreDao,
    private readonly lineDao: LineDao,
    private readonly logger: AppLogger,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
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

      const role = await this.rolesDao.findByRoleId(createUserDto.role_id);
      if (!role) {
        throw new ResourceNotFoundException('Role', String(createUserDto.role_id));
      }

      const { password, role_id: _roleId, center_id, line_id, ...userFields } =
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

      let lineFkId: string | undefined;
      if (line_id) {
        const line = await this.lineDao.findActiveById(line_id);
        if (!line) {
          throw new ResourceNotFoundException('Line', line_id);
        }
        lineFkId = line.id;
      }

      const user = this.usersDao.create({
        id: generateSnowflakeId(),
        ...userFields,
        user_id,
        role_id: role.id,
        center_id: centreFkId,
        line_id: lineFkId,
        password: password_hash,
      });
      const savedUser = await this.usersDao.save(user);

      this.logger.log(`User created with ID: ${savedUser.id}`, UsersService.context);
      return savedUser;
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

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<User>> {
    this.logger.log(
      `Fetching users — page: ${query.page}, limit: ${query.limit}`,
      UsersService.context,
    );

    try {
      return await this.usersDao.findPaginated(query);
    } catch (error) {
      this.logger.error(
        `Failed to fetch users: ${(error as Error).message}`,
        (error as Error).stack,
        UsersService.context,
      );
      throw new DatabaseException('Failed to fetch users. Please try again.');
    }
  }

  async findOne(id: string): Promise<User> {
    this.logger.log(`Fetching user ID: ${id}`, UsersService.context);

    try {
      const user = await this.usersDao.findActiveById(id);
      if (!user) {
        throw new ResourceNotFoundException('User', id);
      }
      return user;
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

  async findByEmail(email: string): Promise<User | null> {
    this.logger.log(`Lookup by email: ${email}`, UsersService.context);

    try {
      return await this.usersDao.findByEmail(email);
    } catch (error) {
      this.logger.error(
        `Failed to find user by email: ${(error as Error).message}`,
        (error as Error).stack,
        UsersService.context,
      );
      throw new DatabaseException('Failed to look up user by email.');
    }
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    this.logger.log(`Updating user ID: ${id}`, UsersService.context);

    try {
      const user = await this.findOne(id);

      if (updateUserDto.email && updateUserDto.email !== user.email) {
        const existingEmail = await this.usersDao.findByEmail(updateUserDto.email);
        if (existingEmail) {
          throw new DuplicateResourceException('User', 'email', updateUserDto.email);
        }
      }

      const { role_id: businessRoleId, center_id, line_id, ...updateFields } = updateUserDto;
      let roleFkId: string | undefined;
      if (businessRoleId !== undefined) {
        const role = await this.rolesDao.findByRoleId(businessRoleId);
        if (!role) {
          throw new ResourceNotFoundException('Role', String(businessRoleId));
        }
        roleFkId = role.id;
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

      let lineFkId: string | null | undefined;
      if (line_id !== undefined) {
        if (line_id === null || line_id === '') {
          lineFkId = null;
        } else {
          const line = await this.lineDao.findActiveById(line_id);
          if (!line) {
            throw new ResourceNotFoundException('Line', line_id);
          }
          lineFkId = line.id;
        }
      }

      const mergedUser = this.usersDao.merge(user, {
        ...updateFields,
        ...(roleFkId !== undefined ? { role_id: roleFkId } : {}),
        ...(centreFkId !== undefined ? { center_id: centreFkId } : {}),
        ...(lineFkId !== undefined ? { line_id: lineFkId } : {}),
      });
      const savedUser = await this.usersDao.save(mergedUser);

      this.logger.log(`User updated ID: ${savedUser.id}`, UsersService.context);
      return savedUser;
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
      const user = await this.findOne(id);
      user.is_deleted = true;
      await this.usersDao.save(user);
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
}
