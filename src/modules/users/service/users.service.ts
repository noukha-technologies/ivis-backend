import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { CreateUserDto, UpdateUserDto } from '../../../common/dto/user.dto.js';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import { PaginatedResult } from '../../../common/interfaces/pagination.interface.js';
import {
  DatabaseException,
  DuplicateResourceException,
  ResourceNotFoundException,
} from '../../../common/exceptions/custom.exception.js';
import { AppLogger } from '../../../common/logger/app.logger.js';
import { generateSnowflakeId } from '../../../common/shared/snowflakeIdGeneration.js';
import { User } from '../../database/entity/user.entity.js';
import { UsersDao } from '../../database/dao/users.dao.js';
import { IUsersService } from './user.service.interface.js';

@Injectable()
export class UsersService implements IUsersService {
  private static readonly context = 'UsersService';

  constructor(
    private readonly usersDao: UsersDao,
    private readonly logger: AppLogger,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    this.logger.log(`Creating user with email: ${createUserDto.email}`, UsersService.context);

    try {
      const existingEmail = await this.usersDao.findByEmail(createUserDto.email);
      if (existingEmail) {
        throw new DuplicateResourceException('User', 'email', createUserDto.email);
      }

      const existingUserId = await this.usersDao.findByUserId(createUserDto.user_id);
      if (existingUserId) {
        throw new DuplicateResourceException('User', 'user_id', createUserDto.user_id);
      }

      const { password, ...userFields } = createUserDto;
      const password_hash = await bcrypt.hash(password, 10);
      const user = this.usersDao.create({
        id: generateSnowflakeId(),
        ...userFields,
        password_hash,
      });
      const savedUser = await this.usersDao.save(user);

      this.logger.log(`User created with ID: ${savedUser.id}`, UsersService.context);
      return savedUser;
    } catch (error) {
      if (error instanceof DuplicateResourceException) {
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

      const mergedUser = this.usersDao.merge(user, updateUserDto);
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
