import { Injectable } from '@nestjs/common';
import { CreateChargeDto, UpdateChargeDto } from '../../../../common/dto/charge.dto';
import { PaginationQueryDto } from '../../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../../common/interfaces/pagination.interface';
import {
  DatabaseException,
  DuplicateResourceException,
  ResourceNotFoundException,
} from '../../../../common/exceptions/custom.exception';
import { AppLogger } from '../../../../common/logger/app.logger';
import { generateSnowflakeId } from '../../../../common/shared/snowflakeIdGeneration';
import { Charge } from '../../../database/entity/charge.entity';
import { ChargeDao } from '../../../database/dao/charge.dao';
import { CentreDao } from '../../../database/dao/centre.dao';
import { ChargeCategoryDao } from '../../../database/dao/charge-category.dao';
import type { UserContext } from '../../../../common/dto/auth.dto';
import { getCreatedById } from '../../../../common/utils/created-by.util';

@Injectable()
export class ChargeService {
  private static readonly context = 'ChargeService';

  constructor(
    private readonly chargeDao: ChargeDao,
    private readonly centreDao: CentreDao,
    private readonly chargeCategoryDao: ChargeCategoryDao,
    private readonly logger: AppLogger,
  ) {}

  private computeGrandTotal(centerCharges: number, ropCharges: number, vatPercent: number): number {
    return Number(((centerCharges + ropCharges) * (1 + vatPercent / 100)).toFixed(3));
  }

  async create(dto: CreateChargeDto, actor: UserContext): Promise<Charge> {
    this.logger.log(`Creating charge — category: ${dto.charge_category_id}`, ChargeService.context);

    try {
      if (dto.centre_id) {
        const centre = await this.centreDao.findActiveById(dto.centre_id);
        if (!centre) {
          throw new ResourceNotFoundException('Centre', dto.centre_id);
        }
      }

      const chargeCategory = await this.chargeCategoryDao.findActiveById(dto.charge_category_id);
      if (!chargeCategory) {
        throw new ResourceNotFoundException('ChargeCategory', dto.charge_category_id);
      }

      const existing = await this.chargeDao.findByCombo(dto.centre_id, dto.vehicle_type, dto.charge_category_id);
      if (existing) {
        throw new DuplicateResourceException('Charge', 'centre/vehicle/category combination', dto.charge_category_id);
      }

      let charge_id = dto.charge_id;
      if (!charge_id) {
        charge_id = await this.chargeDao.getNextChargeId();
      } else {
        const existingId = await this.chargeDao.findByChargeId(charge_id);
        if (existingId) {
          throw new DuplicateResourceException('Charge', 'charge_id', charge_id);
        }
      }

      const grand_total = this.computeGrandTotal(dto.center_charges, dto.rop_charges, dto.vat_percent);

      const charge = this.chargeDao.create({
        id: generateSnowflakeId(),
        ...dto,
        charge_id,
        grand_total,
        status: dto.status ?? 'Active',
        is_enabled: dto.is_enabled ?? true,
        created_by: getCreatedById(actor),
      });

      const saved = await this.chargeDao.save(charge);
      this.logger.log(`Charge created ID: ${saved.id}`, ChargeService.context);
      return saved;
    } catch (error) {
      if (
        error instanceof DuplicateResourceException ||
        error instanceof ResourceNotFoundException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to create charge: ${(error as Error).message}`,
        (error as Error).stack,
        ChargeService.context,
      );
      throw new DatabaseException('Failed to create charge. Please try again.');
    }
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<Charge>> {
    this.logger.log(`Fetching charges — page: ${query.page}, limit: ${query.limit}`, ChargeService.context);

    try {
      return await this.chargeDao.findPaginated(query);
    } catch (error) {
      this.logger.error(
        `Failed to fetch charges: ${(error as Error).message}`,
        (error as Error).stack,
        ChargeService.context,
      );
      throw new DatabaseException('Failed to fetch charges. Please try again.');
    }
  }

  async findOne(id: string): Promise<Charge> {
    this.logger.log(`Fetching charge ID: ${id}`, ChargeService.context);

    try {
      const charge = await this.chargeDao.findActiveById(id);
      if (!charge) {
        throw new ResourceNotFoundException('Charge', id);
      }
      return charge;
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to fetch charge: ${(error as Error).message}`,
        (error as Error).stack,
        ChargeService.context,
      );
      throw new DatabaseException('Failed to fetch charge. Please try again.');
    }
  }

  async update(id: string, dto: UpdateChargeDto): Promise<Charge> {
    this.logger.log(`Updating charge ID: ${id}`, ChargeService.context);

    try {
      const charge = await this.findOne(id);

      if (dto.centre_id !== undefined && dto.centre_id !== charge.centre_id) {
        if (dto.centre_id) {
          const centre = await this.centreDao.findActiveById(dto.centre_id);
          if (!centre) {
            throw new ResourceNotFoundException('Centre', dto.centre_id);
          }
        }
      }

      if (dto.charge_category_id && dto.charge_category_id !== charge.charge_category_id) {
        const chargeCategory = await this.chargeCategoryDao.findActiveById(dto.charge_category_id);
        if (!chargeCategory) {
          throw new ResourceNotFoundException('ChargeCategory', dto.charge_category_id);
        }
      }

      const newCentreId = dto.centre_id !== undefined ? dto.centre_id : charge.centre_id;
      const newVehicleType = dto.vehicle_type ?? charge.vehicle_type;
      const newCategoryId = dto.charge_category_id ?? charge.charge_category_id;

      if (
        newCentreId !== charge.centre_id ||
        newVehicleType !== charge.vehicle_type ||
        newCategoryId !== charge.charge_category_id
      ) {
        const existing = await this.chargeDao.findByCombo(newCentreId, newVehicleType, newCategoryId!);
        if (existing && existing.id !== id) {
          throw new DuplicateResourceException('Charge', 'centre/vehicle/category combination', newCategoryId!);
        }
      }

      const mergedCharge = this.chargeDao.merge(charge, dto);

      const finalCenterCharges = Number(mergedCharge.center_charges);
      const finalRopCharges = Number(mergedCharge.rop_charges);
      const finalVatPercent = Number(mergedCharge.vat_percent);
      mergedCharge.grand_total = this.computeGrandTotal(finalCenterCharges, finalRopCharges, finalVatPercent);

      const saved = await this.chargeDao.save(mergedCharge);
      this.logger.log(`Charge updated ID: ${saved.id}`, ChargeService.context);
      return saved;
    } catch (error) {
      if (
        error instanceof ResourceNotFoundException ||
        error instanceof DuplicateResourceException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to update charge: ${(error as Error).message}`,
        (error as Error).stack,
        ChargeService.context,
      );
      throw new DatabaseException('Failed to update charge. Please try again.');
    }
  }

  async remove(id: string): Promise<void> {
    this.logger.log(`Deleting charge ID: ${id}`, ChargeService.context);

    try {
      const charge = await this.findOne(id);
      charge.is_deleted = true;
      await this.chargeDao.save(charge);
      this.logger.log(`Charge soft-deleted ID: ${id}`, ChargeService.context);
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to delete charge: ${(error as Error).message}`,
        (error as Error).stack,
        ChargeService.context,
      );
      throw new DatabaseException('Failed to delete charge. Please try again.');
    }
  }
}
