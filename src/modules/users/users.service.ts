import { Injectable, Logger } from '@nestjs/common';
import { User } from '../database/entity/user.entity.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { PaginationQueryDto } from './dto/pagination-query.dto.js';
import { UsersRepository, PaginatedResult } from '../database/dao/users.entity.dao.js';
import {
  DuplicateResourceException,
  ResourceNotFoundException,
  DatabaseException,
} from '../../common/exceptions/custom.exception.js';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly usersRepository: UsersRepository) { }

  /**
   * Create a new user.
   * Checks for duplicate email and user_id before inserting.
   */
  async create(createUserDto: CreateUserDto): Promise<User> {
    this.logger.log(`Creating user with email: ${createUserDto.email}`);

    try {
      // Check duplicate email
      const existingEmail = await this.usersRepository.findByEmail(createUserDto.email);
      if (existingEmail) {
        throw new DuplicateResourceException('User', 'email', createUserDto.email);
      }

      // Check duplicate user_id
      const existingUserId = await this.usersRepository.findByUserId(createUserDto.user_id);
      if (existingUserId) {
        throw new DuplicateResourceException('User', 'user_id', createUserDto.user_id);
      }

      const user = this.usersRepository.create(createUserDto);
      const savedUser = await this.usersRepository.save(user);

      this.logger.log(`User created successfully with ID: ${savedUser.id}`);
      return savedUser;
    } catch (error) {
      // Re-throw known application exceptions
      if (error instanceof DuplicateResourceException) {
        throw error;
      }
      this.logger.error(`Failed to create user: ${(error as Error).message}`, (error as Error).stack);
      throw new DatabaseException('Failed to create user. Please try again.');
    }
  }

  /**
   * Retrieve all users with pagination and optional search.
   */
  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<User>> {
    this.logger.log(`Fetching users — page: ${query.page}, limit: ${query.limit}, search: ${query.search || 'N/A'}`);

    try {
      return await this.usersRepository.findPaginated(query);
    } catch (error) {
      this.logger.error(`Failed to fetch users: ${(error as Error).message}`, (error as Error).stack);
      throw new DatabaseException('Failed to fetch users. Please try again.');
    }
  }

  /**
   * Retrieve a single user by UUID.
   */
  async findOne(id: string): Promise<User> {
    this.logger.log(`Fetching user with ID: ${id}`);

    try {
      const user = await this.usersRepository.findOne({ where: { id, is_deleted: false } });
      if (!user) {
        throw new ResourceNotFoundException('User', id);
      }
      return user;
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to fetch user: ${(error as Error).message}`, (error as Error).stack);
      throw new DatabaseException('Failed to fetch user. Please try again.');
    }
  }

  /**
   * Find user by email address.
   */
  async findByEmail(email: string): Promise<User | null> {
    this.logger.log(`Looking up user by email: ${email}`);

    try {
      return await this.usersRepository.findByEmail(email);
    } catch (error) {
      this.logger.error(`Failed to find user by email: ${(error as Error).message}`, (error as Error).stack);
      throw new DatabaseException('Failed to look up user by email.');
    }
  }

  /**
   * Update a user by UUID.
   * Validates duplicate email if email is being changed.
   */
  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    this.logger.log(`Updating user with ID: ${id}`);

    try {
      const user = await this.findOne(id);

      // If email is being changed, check for duplicates
      if (updateUserDto.email && updateUserDto.email !== user.email) {
        const existingEmail = await this.usersRepository.findByEmail(updateUserDto.email);
        if (existingEmail) {
          throw new DuplicateResourceException('User', 'email', updateUserDto.email);
        }
      }

      const mergedUser = this.usersRepository.merge(user, updateUserDto);
      const savedUser = await this.usersRepository.save(mergedUser);

      this.logger.log(`User updated successfully with ID: ${savedUser.id}`);
      return savedUser;
    } catch (error) {
      if (
        error instanceof ResourceNotFoundException ||
        error instanceof DuplicateResourceException
      ) {
        throw error;
      }
      this.logger.error(`Failed to update user: ${(error as Error).message}`, (error as Error).stack);
      throw new DatabaseException('Failed to update user. Please try again.');
    }
  }

  /**
   * Mark a user as deleted (is_deleted = true) by UUID.
   */
  async remove(id: string): Promise<void> {
    this.logger.log(`Deleting user with ID: ${id}`);
    try {
      const user = await this.findOne(id);
      user.is_deleted = true;
      await this.usersRepository.save(user);
      this.logger.log(`User marked as deleted with ID: ${id}`);
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to delete user: ${(error as Error).message}`, (error as Error).stack);
      throw new DatabaseException('Failed to delete user. Please try again.');
    }
  }
}
