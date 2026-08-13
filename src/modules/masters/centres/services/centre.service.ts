import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
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
import { isGlobalScope } from '../../../../common/constants/access-scope';
import { generateSnowflakeId } from '../../../../common/shared/snowflakeIdGeneration';
import { generateCentreCode } from '../../../../common/utils/generate-centre-code.util';
import { Centre } from '../../../database/entity/centre.entity';
import { CentreDao } from '../../../database/dao/centre.dao';
import { AppointmentBranchLinkService } from '../../../../common/integrations/appointments/appointment-branch-link.service';
import { ICentreService } from './centre.service.interface';

@Injectable()
export class CentreService implements ICentreService {
  private static readonly context = 'CentreService';

  constructor(
    private readonly centreDao: CentreDao,
    private readonly branchLinkService: AppointmentBranchLinkService,
    private readonly logger: AppLogger,
  ) {}

  async create(
    createCentreDto: CreateCentreDto,
    actor: UserContext,
  ): Promise<Centre> {
    this.logger.log(
      `Creating centre: ${createCentreDto.centre_name}`,
      CentreService.context,
    );

    this.assertMayAssignBranch(createCentreDto.provider_branch_code, actor);

    try {
      // Duplicate centre names are not allowed (case-insensitive).
      const existingName = await this.centreDao.findByName(
        createCentreDto.centre_name,
      );
      if (existingName) {
        throw new DuplicateResourceException(
          'Centre',
          'centre_name',
          createCentreDto.centre_name,
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

      // Applied via the link service below, not written directly — see update().
      const { provider_branch_code: branchCode, ...centreFields } =
        createCentreDto;

      const centre = this.centreDao.create({
        id: generateSnowflakeId(),
        ...centreFields,
        centre_id,
        code,
        status: createCentreDto.status || 'Active',
        created_by: getCreatedById(actor),
      });
      const savedCentre = await this.centreDao.save(centre);

      if (branchCode) {
        await this.branchLinkService.link(savedCentre.id, branchCode);
      }

      this.logger.log(
        `Centre created with ID: ${savedCentre.id}`,
        CentreService.context,
      );
      return branchCode ? await this.findOne(savedCentre.id) : savedCentre;
    } catch (error) {
      if (
        error instanceof DuplicateResourceException ||
        error instanceof ForbiddenException ||
        error instanceof BadRequestException
      ) {
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

  /**
   * The appointment branch identifies this centre to an external provider and
   * decides whose bookings and inspection results flow through it, so only a
   * global-scope (Super Admin) user may assign or change it. A centre-scoped
   * user — including a Centre Admin — can edit everything else about a centre
   * but not its provider identity.
   *
   * `actor` is optional so internal, non-request callers (seeding, sync) are
   * not blocked; every HTTP path supplies it.
   */
  private assertMayAssignBranch(
    branchCode: string | null | undefined,
    actor?: UserContext,
  ): void {
    if (branchCode === undefined) return;
    if (!actor) return;
    if (isGlobalScope(actor.user?.access_scope)) return;

    throw new ForbiddenException(
      "Only a Super Admin can set or change a centre's appointment branch.",
    );
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

  async update(
    id: string,
    updateCentreDto: UpdateCentreDto,
    actor?: UserContext,
  ): Promise<Centre> {
    this.logger.log(`Updating centre ID: ${id}`, CentreService.context);

    try {
      const centre = await this.findOne(id);

      if (
        updateCentreDto.provider_branch_code !== undefined &&
        (updateCentreDto.provider_branch_code || null) !==
          (centre.provider_branch_code || null)
      ) {
        this.assertMayAssignBranch(
          updateCentreDto.provider_branch_code,
          actor,
        );
      }

      // Prevent renaming to an existing centre name (case-insensitive).
      if (
        updateCentreDto.centre_name &&
        updateCentreDto.centre_name.trim().toLowerCase() !==
          centre.centre_name.toLowerCase()
      ) {
        const existingName = await this.centreDao.findByName(
          updateCentreDto.centre_name,
        );
        if (existingName && existingName.id !== id) {
          throw new DuplicateResourceException(
            'Centre',
            'centre_name',
            updateCentreDto.centre_name,
          );
        }
      }

      // Code is derived from centre_id (immutable) — never changes on update.
      const { code: _ignoredCode, ...namedFields } = updateCentreDto;

      // The branch code is validated against the provider's live directory and
      // applied through the link service, so choosing a branch also maps its
      // lanes onto this centre's lines. Letting it through as a plain column
      // write would save an unverified code and leave every lane unmapped.
      const branchChanged =
        namedFields.provider_branch_code !== undefined &&
        (namedFields.provider_branch_code || null) !==
          (centre.provider_branch_code || null);
      const nextBranchCode = namedFields.provider_branch_code;
      // Stripped before merge: the column is written by the link service, and
      // its nullable type does not fit TypeORM's DeepPartial anyway.
      const { provider_branch_code: _branch, ...columnFields } = namedFields;

      const mergedCentre = this.centreDao.merge(centre, columnFields);
      const savedCentre = await this.centreDao.save(mergedCentre);

      if (branchChanged) {
        if (nextBranchCode) {
          await this.branchLinkService.link(id, nextBranchCode);
        } else {
          await this.branchLinkService.unlink(id);
        }
        return this.findOne(id);
      }

      this.logger.log(
        `Centre updated ID: ${savedCentre.id}`,
        CentreService.context,
      );
      return savedCentre;
    } catch (error) {
      if (
        error instanceof ResourceNotFoundException ||
        error instanceof DuplicateResourceException ||
        error instanceof ForbiddenException ||
        error instanceof BadRequestException
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
