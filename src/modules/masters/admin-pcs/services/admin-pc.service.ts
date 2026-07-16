import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CreateAdminPcDto,
  UpdateAdminPcDto,
} from '../../../../common/dto/admin-pc.dto';
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
import { AdminPcLineMappingDao } from '../../../database/dao/admin-pc-line-mapping.dao';
import { AdminPc } from '../../../database/entity/admin-pc.entity';
import { AdminPcDao } from '../../../database/dao/admin-pc.dao';
import { MasterScopeService } from '../../../../common/services/master-scope.service';

@Injectable()
export class AdminPcService {
  private static readonly context = 'AdminPcService';

  constructor(
    private readonly adminPcDao: AdminPcDao,
    private readonly adminPcLineMappingDao: AdminPcLineMappingDao,
    private readonly masterScope: MasterScopeService,
    private readonly logger: AppLogger,
  ) {}

  async create(
    createAdminPcDto: CreateAdminPcDto,
    actor: UserContext,
  ): Promise<AdminPc> {
    this.logger.log(`Creating Admin PC`, AdminPcService.context);

    try {
      const existingName = await this.adminPcDao.findByName(
        createAdminPcDto.name,
      );
      if (existingName) {
        throw new DuplicateResourceException(
          'AdminPc',
          'name',
          createAdminPcDto.name,
        );
      }

      const centerId =
        this.masterScope.resolveCentreFilter(actor.user) ||
        createAdminPcDto.center_id;
      if (!centerId) {
        throw new BadRequestException('center_id is required.');
      }
      await this.masterScope.resolveCentreId(centerId);

      const lineIds = this.normalizeLineIds(
        createAdminPcDto.line_ids?.length
          ? createAdminPcDto.line_ids
          : [createAdminPcDto.line_id],
      );
      await this.masterScope.assertLinesBelongToCentre(lineIds, centerId);
      await this.validateLineAssignments(lineIds);

      let admin_pc_id = createAdminPcDto.admin_pc_id;
      if (!admin_pc_id) {
        admin_pc_id = await this.adminPcDao.getNextId();
      } else {
        const existingId = await this.adminPcDao.findByAdminPcId(admin_pc_id);
        if (existingId) {
          throw new DuplicateResourceException(
            'AdminPc',
            'admin_pc_id',
            admin_pc_id,
          );
        }
      }

      const code =
        createAdminPcDto.code || `APC${String(admin_pc_id).padStart(3, '0')}`;
      const existingCode = await this.adminPcDao.findByCode(code);
      if (existingCode) {
        throw new DuplicateResourceException('AdminPc', 'code', code);
      }

      const adminPcFields = { ...createAdminPcDto };
      delete (adminPcFields as Partial<CreateAdminPcDto>).line_ids;
      delete (adminPcFields as Partial<CreateAdminPcDto>).line_id;

      const adminPc = this.adminPcDao.create({
        id: generateSnowflakeId(),
        ...adminPcFields,
        admin_pc_id,
        code,
        center_id: centerId,
        status: createAdminPcDto.status || 'Active',
        created_by: getCreatedById(actor),
      });
      // Virtual field (not a DB column) — set so the CREATE audit snapshot
      // includes Line before mappings are written in AdminPcLineMapping.
      adminPc.line_ids = lineIds;
      const savedAdminPc = await this.adminPcDao.save(adminPc);
      await this.adminPcLineMappingDao.replaceForAdminPc(
        savedAdminPc.id,
        lineIds,
        getCreatedById(actor),
      );

      this.logger.log(
        `Admin PC created with ID: ${savedAdminPc.id}`,
        AdminPcService.context,
      );
      return (
        (await this.adminPcDao.findActiveById(savedAdminPc.id)) ?? savedAdminPc
      );
    } catch (error) {
      if (
        error instanceof DuplicateResourceException ||
        error instanceof ResourceNotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to create Admin PC: ${(error as Error).message}`,
        (error as Error).stack,
        AdminPcService.context,
      );
      throw new DatabaseException(
        'Failed to create Admin PC record. Please try again.',
      );
    }
  }

  async findAll(
    query: PaginationQueryDto & { center_id?: string },
    actor: UserContext,
  ): Promise<PaginatedResult<AdminPc>> {
    this.logger.log(
      `Fetching Admin PCs — page: ${query.page}, limit: ${query.limit}`,
      AdminPcService.context,
    );

    try {
      const centerFilterId =
        this.masterScope.resolveCentreFilter(actor.user) || query.center_id;
      return await this.adminPcDao.findPaginated(query, centerFilterId);
    } catch (error) {
      this.logger.error(
        `Failed to fetch Admin PCs: ${(error as Error).message}`,
        (error as Error).stack,
        AdminPcService.context,
      );
      throw new DatabaseException(
        'Failed to fetch Admin PC records. Please try again.',
      );
    }
  }

  async findOne(id: string, actor?: UserContext): Promise<AdminPc> {
    this.logger.log(`Fetching Admin PC ID: ${id}`, AdminPcService.context);

    try {
      const adminPc = await this.adminPcDao.findActiveById(id);
      if (!adminPc) {
        throw new ResourceNotFoundException('AdminPc', id);
      }

      if (actor) {
        const userCenterId = this.masterScope.resolveCentreFilter(actor.user);
        if (userCenterId && adminPc.center_id !== userCenterId) {
          throw new ResourceNotFoundException('AdminPc', id);
        }
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
      throw new DatabaseException(
        'Failed to fetch Admin PC record. Please try again.',
      );
    }
  }

  async update(
    id: string,
    updateAdminPcDto: UpdateAdminPcDto,
    actor: UserContext,
  ): Promise<AdminPc> {
    this.logger.log(`Updating Admin PC ID: ${id}`, AdminPcService.context);

    try {
      const adminPc = await this.findOne(id, actor);

      const userCenterId = this.masterScope.resolveCentreFilter(actor.user);
      const centerId =
        userCenterId || updateAdminPcDto.center_id || adminPc.center_id;

      if (centerId) {
        await this.masterScope.resolveCentreId(centerId);
      }

      if (
        updateAdminPcDto.name &&
        updateAdminPcDto.name.toLowerCase() !== adminPc.name.toLowerCase()
      ) {
        const existingName = await this.adminPcDao.findByName(
          updateAdminPcDto.name,
        );
        if (existingName) {
          throw new DuplicateResourceException(
            'AdminPc',
            'name',
            updateAdminPcDto.name,
          );
        }
      }

      if (updateAdminPcDto.code && updateAdminPcDto.code !== adminPc.code) {
        const existingCode = await this.adminPcDao.findByCode(
          updateAdminPcDto.code,
        );
        if (existingCode) {
          throw new DuplicateResourceException(
            'AdminPc',
            'code',
            updateAdminPcDto.code,
          );
        }
      }

      const lineIdsBefore = [...(adminPc.line_ids ?? [])];
      const requestedLineIds =
        updateAdminPcDto.line_ids || updateAdminPcDto.line_id
          ? this.normalizeLineIds(
              updateAdminPcDto.line_ids ??
                (updateAdminPcDto.line_id ? [updateAdminPcDto.line_id] : []),
            )
          : null;
      const linesChanged =
        requestedLineIds !== null &&
        !this.sameLineIds(requestedLineIds, lineIdsBefore);
      let nextLineIds = lineIdsBefore;
      if (linesChanged && requestedLineIds) {
        if (centerId) {
          await this.masterScope.assertLinesBelongToCentre(
            requestedLineIds,
            centerId,
          );
        }
        await this.validateLineAssignments(requestedLineIds, id);
        await this.adminPcLineMappingDao.replaceForAdminPc(
          id,
          requestedLineIds,
          adminPc.created_by,
        );
        nextLineIds = requestedLineIds;
      }

      const updateFields = { ...updateAdminPcDto };
      delete (updateFields as Partial<UpdateAdminPcDto>).line_ids;
      delete (updateFields as Partial<UpdateAdminPcDto>).line_id;

      const mergedAdminPc = this.adminPcDao.merge(adminPc, {
        ...updateFields,
        center_id: centerId,
      });
      if (linesChanged) {
        mergedAdminPc.line_ids = nextLineIds;
        (mergedAdminPc as unknown as Record<string, unknown>).__auditLineIdsBefore =
          lineIdsBefore;
      } else {
        delete mergedAdminPc.line_ids;
        delete mergedAdminPc.lines;
      }
      const savedAdminPc = await this.adminPcDao.save(mergedAdminPc);

      this.logger.log(
        `Admin PC updated ID: ${savedAdminPc.id}`,
        AdminPcService.context,
      );
      return (
        (await this.adminPcDao.findActiveById(savedAdminPc.id)) ?? savedAdminPc
      );
    } catch (error) {
      if (
        error instanceof ResourceNotFoundException ||
        error instanceof DuplicateResourceException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to update Admin PC: ${(error as Error).message}`,
        (error as Error).stack,
        AdminPcService.context,
      );
      throw new DatabaseException(
        'Failed to update Admin PC record. Please try again.',
      );
    }
  }

  async remove(id: string, actor: UserContext): Promise<void> {
    this.logger.log(`Deleting Admin PC ID: ${id}`, AdminPcService.context);

    try {
      const adminPc = await this.findOne(id, actor);
      adminPc.is_deleted = true;
      await this.adminPcDao.save(adminPc);
      await this.adminPcLineMappingDao.softDeleteByAdminPcId(id);
      this.logger.log(
        `Admin PC soft-deleted ID: ${id}`,
        AdminPcService.context,
      );
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to delete Admin PC: ${(error as Error).message}`,
        (error as Error).stack,
        AdminPcService.context,
      );
      throw new DatabaseException(
        'Failed to delete Admin PC record. Please try again.',
      );
    }
  }

  private normalizeLineIds(lineIds: string[]): string[] {
    return [...new Set(lineIds.map((lineId) => lineId.trim()).filter(Boolean))];
  }

  private sameLineIds(a: string[], b: string[]): boolean {
    const norm = (ids: string[]) =>
      [...new Set(ids.map((id) => id.trim()).filter(Boolean))].sort();
    const left = norm(a);
    const right = norm(b);
    return (
      left.length === right.length && left.every((id, index) => id === right[index])
    );
  }

  private async validateLineAssignments(
    lineIds: string[],
    excludeAdminPcId?: string,
  ): Promise<void> {
    if (!lineIds.length) {
      throw new BadRequestException('At least one line is required.');
    }

    for (const lineId of lineIds) {
      await this.masterScope.assertLineExists(lineId);
    }

    await this.masterScope.assertLinesHaveNoAdminPc(lineIds, excludeAdminPcId);
  }
}
