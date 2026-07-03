import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateLineDto, UpdateLineDto } from '../../../../common/dto/line.dto';
import { LineListQueryDto } from '../../../../common/dto/line-list-query.dto';
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
import { CameraDao } from '../../../database/dao/camera.dao';
import { AdminPcDao } from '../../../database/dao/admin-pc.dao';
import { UserLineMappingDao } from '../../../database/dao/user-line-mapping.dao';
import type { UserContext } from '../../../../common/dto/auth.dto';
import { MasterScopeService } from '../../../../common/services/master-scope.service';
import { getCreatedById } from '../../../../common/utils/created-by.util';
import { ILineService } from './line.service.interface';

@Injectable()
export class LineService implements ILineService {
  private static readonly context = 'LineService';

  constructor(
    private readonly lineDao: LineDao,
    private readonly centreDao: CentreDao,
    private readonly cameraDao: CameraDao,
    private readonly adminPcDao: AdminPcDao,
    private readonly userLineMappingDao: UserLineMappingDao,
    private readonly masterScope: MasterScopeService,
    private readonly logger: AppLogger,
  ) {}

  async create(createLineDto: CreateLineDto, actor: UserContext): Promise<Line> {
    this.logger.log(`Creating line with code: ${createLineDto.code}`, LineService.context);

    try {
      const existingCode = await this.lineDao.findByCode(createLineDto.code);
      if (existingCode) {
        throw new DuplicateResourceException('Line', 'code', createLineDto.code);
      }

      const existingName = await this.lineDao.findByName(createLineDto.name);
      if (existingName) {
        throw new DuplicateResourceException('Line', 'name', createLineDto.name);
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
        created_by: getCreatedById(actor),
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

  async findAll(query: LineListQueryDto): Promise<PaginatedResult<Line>> {
    this.logger.log(`Fetching lines — page: ${query.page}, limit: ${query.limit}`, LineService.context);

    try {
      let centreFilterId: string | undefined;
      if (query.centre_id) {
        centreFilterId = await this.masterScope.resolveCentreId(query.centre_id);
      }
      return await this.lineDao.findPaginated(query, centreFilterId);
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

      if (updateLineDto.name && updateLineDto.name.trim().toLowerCase() !== line.name.trim().toLowerCase()) {
        const existingName = await this.lineDao.findByName(updateLineDto.name, id);
        if (existingName) {
          throw new DuplicateResourceException('Line', 'name', updateLineDto.name);
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
      await this.assertLineHasNoDependents(id);
      line.is_deleted = true;
      await this.lineDao.save(line);
      this.logger.log(`Line soft-deleted ID: ${id}`, LineService.context);
    } catch (error) {
      if (error instanceof ResourceNotFoundException || error instanceof BadRequestException) {
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

  private async assertLineHasNoDependents(lineId: string): Promise<void> {
    const camera = await this.cameraDao.findActiveByLineId(lineId);
    if (camera) {
      throw new BadRequestException('Cannot delete line: an active camera is assigned to this line.');
    }
    const adminPc = await this.adminPcDao.findActiveByLineId(lineId);
    if (adminPc) {
      throw new BadRequestException('Cannot delete line: an active admin PC is assigned to this line.');
    }
    const mappings = await this.userLineMappingDao.findActiveByLineIds([lineId]);
    if (mappings.length > 0) {
      throw new BadRequestException('Cannot delete line: one or more users are assigned to this line.');
    }
  }
}
