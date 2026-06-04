import { Injectable } from '@nestjs/common';
import { CreateAdminPcDto, UpdateAdminPcDto } from '../../../../common/dto/admin-pc.dto';
import { PaginationQueryDto } from '../../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../../common/interfaces/pagination.interface';
import {
  DatabaseException,
  DuplicateResourceException,
  ResourceNotFoundException,
} from '../../../../common/exceptions/custom.exception';
import { AppLogger } from '../../../../common/logger/app.logger';
import type { UserContext } from '../../../../common/dto/auth.dto';
import { getCreatedById } from '../../../../common/utils/created-by.util';
import { generateSnowflakeId } from '../../../../common/shared/snowflakeIdGeneration';
import { AdminPc } from '../../../database/entity/admin-pc.entity';
import { AdminPcDao } from '../../../database/dao/admin-pc.dao';
import { MasterScopeService } from '../../../../common/services/master-scope.service';

@Injectable()
export class AdminPcService {
  private static readonly context = 'AdminPcService';

  constructor(
    private readonly adminPcDao: AdminPcDao,
    private readonly masterScope: MasterScopeService,
    private readonly logger: AppLogger,
  ) {}

  async create(createAdminPcDto: CreateAdminPcDto, actor: UserContext): Promise<AdminPc> {
    this.logger.log(`Creating Admin PC with code: ${createAdminPcDto.code}`, AdminPcService.context);

    try {
      const existingCode = await this.adminPcDao.findByCode(createAdminPcDto.code);
      if (existingCode) {
        throw new DuplicateResourceException('AdminPc', 'code', createAdminPcDto.code);
      }

      await this.masterScope.assertLineExists(createAdminPcDto.line_id);
      await this.masterScope.assertLineHasNoAdminPc(createAdminPcDto.line_id);

      let admin_pc_id = createAdminPcDto.admin_pc_id;
      if (!admin_pc_id) {
        admin_pc_id = await this.adminPcDao.getNextId();
      } else {
        const existingId = await this.adminPcDao.findByAdminPcId(admin_pc_id);
        if (existingId) {
          throw new DuplicateResourceException('AdminPc', 'admin_pc_id', admin_pc_id);
        }
      }

      const adminPc = this.adminPcDao.create({
        id: generateSnowflakeId(),
        ...createAdminPcDto,
        admin_pc_id,
        status: createAdminPcDto.status || 'Active',
        created_by: getCreatedById(actor),
      });
      const savedAdminPc = await this.adminPcDao.save(adminPc);

      this.logger.log(`Admin PC created with ID: ${savedAdminPc.id}`, AdminPcService.context);
      return savedAdminPc;
    } catch (error) {
      if (error instanceof DuplicateResourceException || error instanceof ResourceNotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to create Admin PC: ${(error as Error).message}`,
        (error as Error).stack,
        AdminPcService.context,
      );
      throw new DatabaseException('Failed to create Admin PC record. Please try again.');
    }
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<AdminPc>> {
    this.logger.log(`Fetching Admin PCs — page: ${query.page}, limit: ${query.limit}`, AdminPcService.context);

    try {
      return await this.adminPcDao.findPaginated(query);
    } catch (error) {
      this.logger.error(
        `Failed to fetch Admin PCs: ${(error as Error).message}`,
        (error as Error).stack,
        AdminPcService.context,
      );
      throw new DatabaseException('Failed to fetch Admin PC records. Please try again.');
    }
  }

  async findOne(id: string): Promise<AdminPc> {
    this.logger.log(`Fetching Admin PC ID: ${id}`, AdminPcService.context);

    try {
      const adminPc = await this.adminPcDao.findActiveById(id);
      if (!adminPc) {
        throw new ResourceNotFoundException('AdminPc', id);
      }
      return adminPc;
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to fetch Admin PC: ${(error as Error).message}`,
        (error as Error).stack,
        AdminPcService.context,
      );
      throw new DatabaseException('Failed to fetch Admin PC record. Please try again.');
    }
  }

  async update(id: string, updateAdminPcDto: UpdateAdminPcDto): Promise<AdminPc> {
    this.logger.log(`Updating Admin PC ID: ${id}`, AdminPcService.context);

    try {
      const adminPc = await this.findOne(id);

      if (updateAdminPcDto.code && updateAdminPcDto.code !== adminPc.code) {
        const existingCode = await this.adminPcDao.findByCode(updateAdminPcDto.code);
        if (existingCode) {
          throw new DuplicateResourceException('AdminPc', 'code', updateAdminPcDto.code);
        }
      }

      if (updateAdminPcDto.line_id) {
        await this.masterScope.assertLineExists(updateAdminPcDto.line_id);
        await this.masterScope.assertLineHasNoAdminPc(updateAdminPcDto.line_id, id);
      }

      const mergedAdminPc = this.adminPcDao.merge(adminPc, updateAdminPcDto);
      const savedAdminPc = await this.adminPcDao.save(mergedAdminPc);

      this.logger.log(`Admin PC updated ID: ${savedAdminPc.id}`, AdminPcService.context);
      return savedAdminPc;
    } catch (error) {
      if (error instanceof ResourceNotFoundException || error instanceof DuplicateResourceException) {
        throw error;
      }
      this.logger.error(
        `Failed to update Admin PC: ${(error as Error).message}`,
        (error as Error).stack,
        AdminPcService.context,
      );
      throw new DatabaseException('Failed to update Admin PC record. Please try again.');
    }
  }

  async remove(id: string): Promise<void> {
    this.logger.log(`Deleting Admin PC ID: ${id}`, AdminPcService.context);

    try {
      const adminPc = await this.findOne(id);
      adminPc.is_deleted = true;
      await this.adminPcDao.save(adminPc);
      this.logger.log(`Admin PC soft-deleted ID: ${id}`, AdminPcService.context);
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to delete Admin PC: ${(error as Error).message}`,
        (error as Error).stack,
        AdminPcService.context,
      );
      throw new DatabaseException('Failed to delete Admin PC record. Please try again.');
    }
  }
}
