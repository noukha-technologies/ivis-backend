import { Injectable } from '@nestjs/common';
import { CreateRoleDto, UpdateRoleDto } from '../../../../common/dto/role.dto.js';
import { PaginationQueryDto } from '../../../../common/dto/pagination.dto.js';
import { PaginatedResult } from '../../../../common/interfaces/pagination.interface.js';
import {
  DatabaseException,
  DuplicateResourceException,
  ResourceNotFoundException,
} from '../../../../common/exceptions/custom.exception.js';
import { AppLogger } from '../../../../common/logger/app.logger.js';
import { generateSnowflakeId } from '../../../../common/shared/snowflakeIdGeneration.js';
import { Role } from '../../../database/entity/role.entity.js';
import { RolesDao } from '../../../database/dao/roles.dao.js';
import { IRolesService } from './role.service.interface.js';

@Injectable()
export class RolesService implements IRolesService {
  private static readonly context = 'RolesService';

  constructor(
    private readonly rolesDao: RolesDao,
    private readonly logger: AppLogger,
  ) { }

  async create(createRoleDto: CreateRoleDto): Promise<Role> {
    this.logger.log(`Creating role with name: ${createRoleDto.role_name}`, RolesService.context);

    try {
      const existingRole = await this.rolesDao.findByRoleName(createRoleDto.role_name);
      if (existingRole) {
        throw new DuplicateResourceException('Role', 'role_name', createRoleDto.role_name);
      }

      const role = this.rolesDao.create({
        id: generateSnowflakeId(),
        ...createRoleDto,
      });
      const savedRole = await this.rolesDao.save(role);

      this.logger.log(`Role created with ID: ${savedRole.id}`, RolesService.context);
      return savedRole;
    } catch (error) {
      if (error instanceof DuplicateResourceException) {
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

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<Role>> {
    this.logger.log(
      `Fetching roles — page: ${query.page}, limit: ${query.limit}`,
      RolesService.context,
    );

    try {
      return await this.rolesDao.findPaginated(query);
    } catch (error) {
      this.logger.error(
        `Failed to fetch roles: ${(error as Error).message}`,
        (error as Error).stack,
        RolesService.context,
      );
      throw new DatabaseException('Failed to fetch roles. Please try again.');
    }
  }

  async findOne(id: string): Promise<Role> {
    this.logger.log(`Fetching role ID: ${id}`, RolesService.context);

    try {
      const role = await this.rolesDao.findActiveById(id);
      if (!role) {
        throw new ResourceNotFoundException('Role', id);
      }
      return role;
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to fetch role: ${(error as Error).message}`,
        (error as Error).stack,
        RolesService.context,
      );
      throw new DatabaseException('Failed to fetch role. Please try again.');
    }
  }

  async findByRoleName(roleName: string): Promise<Role | null> {
    this.logger.log(`Lookup by role name: ${roleName}`, RolesService.context);

    try {
      return await this.rolesDao.findByRoleName(roleName);
    } catch (error) {
      this.logger.error(
        `Failed to find role by name: ${(error as Error).message}`,
        (error as Error).stack,
        RolesService.context,
      );
      throw new DatabaseException('Failed to look up role by name.');
    }
  }

  async update(id: string, updateRoleDto: UpdateRoleDto): Promise<Role> {
    this.logger.log(`Updating role ID: ${id}`, RolesService.context);

    try {
      const role = await this.findOne(id);

      if (updateRoleDto.role_name && updateRoleDto.role_name !== role.role_name) {
        const existingRole = await this.rolesDao.findByRoleName(updateRoleDto.role_name);
        if (existingRole) {
          throw new DuplicateResourceException('Role', 'role_name', updateRoleDto.role_name);
        }
      }

      const mergedRole = this.rolesDao.merge(role, updateRoleDto);
      const savedRole = await this.rolesDao.save(mergedRole);

      this.logger.log(`Role updated ID: ${savedRole.id}`, RolesService.context);
      return savedRole;
    } catch (error) {
      if (
        error instanceof ResourceNotFoundException ||
        error instanceof DuplicateResourceException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to update role: ${(error as Error).message}`,
        (error as Error).stack,
        RolesService.context,
      );
      throw new DatabaseException('Failed to update role. Please try again.');
    }
  }

  async remove(id: string): Promise<void> {
    this.logger.log(`Deleting role ID: ${id}`, RolesService.context);

    try {
      const role = await this.findOne(id);
      role.is_deleted = true;
      await this.rolesDao.save(role);
      this.logger.log(`Role soft-deleted ID: ${id}`, RolesService.context);
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to delete role: ${(error as Error).message}`,
        (error as Error).stack,
        RolesService.context,
      );
      throw new DatabaseException('Failed to delete role. Please try again.');
    }
  }
}
