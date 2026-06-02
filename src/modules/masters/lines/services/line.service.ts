import { Injectable } from '@nestjs/common';
import { CreateLineDto, UpdateLineDto } from '../../../../common/dto/line.dto';
import { PaginationQueryDto } from '../../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../../common/interfaces/pagination.interface';
import {
  DatabaseException,
  DuplicateResourceException,
  ResourceNotFoundException,
} from '../../../../common/exceptions/custom.exception';
import { AppLogger } from '../../../../common/logger/app.logger';
import { generateSnowflakeId } from '../../../../common/shared/snowflakeIdGeneration';
import { Line } from '../../../database/entity/line.entity';
import { LineDao } from '../../../database/dao/line.dao';
import { CentreDao } from '../../../database/dao/centre.dao';
import { ILineService } from './line.service.interface';

@Injectable()
export class LineService implements ILineService {
  private static readonly context = 'LineService';

  constructor(
    private readonly lineDao: LineDao,
    private readonly centreDao: CentreDao,
    private readonly logger: AppLogger,
  ) {}

  async create(createLineDto: CreateLineDto): Promise<Line> {
    this.logger.log(`Creating line with code: ${createLineDto.code}`, LineService.context);

    try {
      const existingCode = await this.lineDao.findByCode(createLineDto.code);
      if (existingCode) {
        throw new DuplicateResourceException('Line', 'code', createLineDto.code);
      }

      const centre = await this.centreDao.findActiveById(createLineDto.centre_id);
      if (!centre) {
        throw new ResourceNotFoundException('Centre', createLineDto.centre_id);
      }

      let line_id = createLineDto.line_id;
      if (!line_id) {
        line_id = await this.lineDao.getNextLineId();
      } else {
        const existingLineId = await this.lineDao.findByLineId(line_id);
        if (existingLineId) {
          throw new DuplicateResourceException('Line', 'line_id', line_id);
        }
      }

      const line = this.lineDao.create({
        id: generateSnowflakeId(),
        ...createLineDto,
        line_id,
        status: createLineDto.status || 'Active',
      });
      const savedLine = await this.lineDao.save(line);

      this.logger.log(`Line created with ID: ${savedLine.id}`, LineService.context);
      return savedLine;
    } catch (error) {
      if (error instanceof DuplicateResourceException || error instanceof ResourceNotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to create line: ${(error as Error).message}`,
        (error as Error).stack,
        LineService.context,
      );
      throw new DatabaseException('Failed to create line. Please try again.');
    }
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<Line>> {
    this.logger.log(`Fetching lines — page: ${query.page}, limit: ${query.limit}`, LineService.context);

    try {
      return await this.lineDao.findPaginated(query);
    } catch (error) {
      this.logger.error(
        `Failed to fetch lines: ${(error as Error).message}`,
        (error as Error).stack,
        LineService.context,
      );
      throw new DatabaseException('Failed to fetch lines. Please try again.');
    }
  }

  async findOne(id: string): Promise<Line> {
    this.logger.log(`Fetching line ID: ${id}`, LineService.context);

    try {
      const line = await this.lineDao.findActiveById(id);
      if (!line) {
        throw new ResourceNotFoundException('Line', id);
      }
      return line;
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to fetch line: ${(error as Error).message}`,
        (error as Error).stack,
        LineService.context,
      );
      throw new DatabaseException('Failed to fetch line. Please try again.');
    }
  }

  async findByCode(code: string): Promise<Line | null> {
    this.logger.log(`Lookup by code: ${code}`, LineService.context);

    try {
      return await this.lineDao.findByCode(code);
    } catch (error) {
      this.logger.error(
        `Failed to find line by code: ${(error as Error).message}`,
        (error as Error).stack,
        LineService.context,
      );
      throw new DatabaseException('Failed to look up line by code.');
    }
  }

  async update(id: string, updateLineDto: UpdateLineDto): Promise<Line> {
    this.logger.log(`Updating line ID: ${id}`, LineService.context);

    try {
      const line = await this.findOne(id);

      if (updateLineDto.code && updateLineDto.code !== line.code) {
        const existingCode = await this.lineDao.findByCode(updateLineDto.code);
        if (existingCode) {
          throw new DuplicateResourceException('Line', 'code', updateLineDto.code);
        }
      }

      if (updateLineDto.centre_id) {
        const centre = await this.centreDao.findActiveById(updateLineDto.centre_id);
        if (!centre) {
          throw new ResourceNotFoundException('Centre', updateLineDto.centre_id);
        }
      }

      const mergedLine = this.lineDao.merge(line, updateLineDto);
      const savedLine = await this.lineDao.save(mergedLine);

      this.logger.log(`Line updated ID: ${savedLine.id}`, LineService.context);
      return savedLine;
    } catch (error) {
      if (error instanceof ResourceNotFoundException || error instanceof DuplicateResourceException) {
        throw error;
      }
      this.logger.error(
        `Failed to update line: ${(error as Error).message}`,
        (error as Error).stack,
        LineService.context,
      );
      throw new DatabaseException('Failed to update line. Please try again.');
    }
  }

  async remove(id: string): Promise<void> {
    this.logger.log(`Deleting line ID: ${id}`, LineService.context);

    try {
      const line = await this.findOne(id);
      line.is_deleted = true;
      await this.lineDao.save(line);
      this.logger.log(`Line soft-deleted ID: ${id}`, LineService.context);
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to delete line: ${(error as Error).message}`,
        (error as Error).stack,
        LineService.context,
      );
      throw new DatabaseException('Failed to delete line. Please try again.');
    }
  }
}
