import { Injectable } from '@nestjs/common';
import {
  CreateCentreDto,
  UpdateCentreDto,
} from '../../../../common/dto/centre.dto';
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
import { generateCentreCode } from '../../../../common/utils/generate-centre-code.util';
import { Centre } from '../../../database/entity/centre.entity';
import { CentreDao } from '../../../database/dao/centre.dao';
import { ICentreService } from './centre.service.interface';

@Injectable()
export class CentreService implements ICentreService {
  private static readonly context = 'CentreService';

  constructor(
    private readonly centreDao: CentreDao,
    private readonly logger: AppLogger,
  ) {}

  async create(
    createCentreDto: CreateCentreDto,
    actor: UserContext,
  ): Promise<Centre> {
    this.logger.log(
      `Creating centre: ${createCentreDto.name}`,
      CentreService.context,
    );

    try {
      // Duplicate centre names are not allowed (case-insensitive).
      const existingName = await this.centreDao.findByName(
        createCentreDto.name,
      );
      if (existingName) {
        throw new DuplicateResourceException(
          'Centre',
          'name',
          createCentreDto.name,
        );
      }

      let centre_id = createCentreDto.centre_id;
      if (!centre_id) {
        centre_id = await this.centreDao.getNextCentreId();
      } else {
        const existingCentreId = await this.centreDao.findByCentreId(centre_id);
        if (existingCentreId) {
          throw new DuplicateResourceException(
            'Centre',
            'centre_id',
            centre_id,
          );
        }
      }

      // Code is auto-generated from the sequential centre id (CM001, CM002, …).
      const code = generateCentreCode(centre_id);
      const existingCode = await this.centreDao.findByCode(code);
      if (existingCode) {
        throw new DuplicateResourceException('Centre', 'code', code);
      }

      const centre = this.centreDao.create({
        id: generateSnowflakeId(),
        ...createCentreDto,
        centre_id,
        code,
        status: createCentreDto.status || 'Active',
        created_by: getCreatedById(actor),
      });
      const savedCentre = await this.centreDao.save(centre);

      this.logger.log(
        `Centre created with ID: ${savedCentre.id}`,
        CentreService.context,
      );
      return savedCentre;
    } catch (error) {
      if (error instanceof DuplicateResourceException) {
        throw error;
      }
      this.logger.error(
        `Failed to create centre: ${(error as Error).message}`,
        (error as Error).stack,
        CentreService.context,
      );
      throw new DatabaseException('Failed to create centre. Please try again.');
    }
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<Centre>> {
    this.logger.log(
      `Fetching centres — page: ${query.page}, limit: ${query.limit}`,
      CentreService.context,
    );

    try {
      return await this.centreDao.findPaginated(query);
    } catch (error) {
      this.logger.error(
        `Failed to fetch centres: ${(error as Error).message}`,
        (error as Error).stack,
        CentreService.context,
      );
      throw new DatabaseException('Failed to fetch centres. Please try again.');
    }
  }

  async findOne(id: string): Promise<Centre> {
    this.logger.log(`Fetching centre ID: ${id}`, CentreService.context);

    try {
      const centre = await this.centreDao.findActiveById(id);
      if (!centre) {
        throw new ResourceNotFoundException('Centre', id);
      }
      return centre;
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to fetch centre: ${(error as Error).message}`,
        (error as Error).stack,
        CentreService.context,
      );
      throw new DatabaseException('Failed to fetch centre. Please try again.');
    }
  }

  async findByCode(code: string): Promise<Centre | null> {
    this.logger.log(`Lookup by code: ${code}`, CentreService.context);

    try {
      return await this.centreDao.findByCode(code);
    } catch (error) {
      this.logger.error(
        `Failed to find centre by code: ${(error as Error).message}`,
        (error as Error).stack,
        CentreService.context,
      );
      throw new DatabaseException('Failed to look up centre by code.');
    }
  }

  async update(id: string, updateCentreDto: UpdateCentreDto): Promise<Centre> {
    this.logger.log(`Updating centre ID: ${id}`, CentreService.context);

    try {
      const centre = await this.findOne(id);

      // Prevent renaming to an existing centre name (case-insensitive).
      if (
        updateCentreDto.name &&
        updateCentreDto.name.trim().toLowerCase() !== centre.name.toLowerCase()
      ) {
        const existingName = await this.centreDao.findByName(
          updateCentreDto.name,
        );
        if (existingName && existingName.id !== id) {
          throw new DuplicateResourceException(
            'Centre',
            'name',
            updateCentreDto.name,
          );
        }
      }

      // Code is derived from centre_id (immutable) — never changes on update.
      const { code: _ignoredCode, ...updateFields } = updateCentreDto;
      const mergedCentre = this.centreDao.merge(centre, updateFields);
      const savedCentre = await this.centreDao.save(mergedCentre);

      this.logger.log(
        `Centre updated ID: ${savedCentre.id}`,
        CentreService.context,
      );
      return savedCentre;
    } catch (error) {
      if (
        error instanceof ResourceNotFoundException ||
        error instanceof DuplicateResourceException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to update centre: ${(error as Error).message}`,
        (error as Error).stack,
        CentreService.context,
      );
      throw new DatabaseException('Failed to update centre. Please try again.');
    }
  }

  async remove(id: string): Promise<void> {
    this.logger.log(`Deleting centre ID: ${id}`, CentreService.context);

    try {
      const centre = await this.findOne(id);
      centre.is_deleted = true;
      await this.centreDao.save(centre);
      this.logger.log(`Centre soft-deleted ID: ${id}`, CentreService.context);
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to delete centre: ${(error as Error).message}`,
        (error as Error).stack,
        CentreService.context,
      );
      throw new DatabaseException('Failed to delete centre. Please try again.');
    }
  }
}
