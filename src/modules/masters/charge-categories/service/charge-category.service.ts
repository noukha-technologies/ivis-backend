import { Injectable } from '@nestjs/common';
import {
  CreateChargeCategoryDto,
  UpdateChargeCategoryDto,
} from '../../../../common/dto/charge-category.dto';
import { PaginationQueryDto } from '../../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../../common/interfaces/pagination.interface';
import { ResourceNotFoundException } from '../../../../common/exceptions/custom.exception';
import { AppLogger } from '../../../../common/logger/app.logger';
import { generateSnowflakeId } from '../../../../common/shared/snowflakeIdGeneration';
import { ChargeCategory } from '../../../database/entity/charge-category.entity';
import { ChargeCategoryDao } from '../../../database/dao/charge-category.dao';
import type { UserContext } from '../../../../common/dto/auth.dto';
import { getCreatedById } from '../../../../common/utils/created-by.util';

@Injectable()
export class ChargeCategoryService {
  private static readonly context = 'ChargeCategoryService';

  constructor(
    private readonly chargeCategoryDao: ChargeCategoryDao,
    private readonly logger: AppLogger,
  ) {}

  async create(
    dto: CreateChargeCategoryDto,
    actor: UserContext,
  ): Promise<ChargeCategory> {
    this.logger.log(
      `Creating charge category — ${dto.vehicle_weight} / ${dto.engine_capacity}`,
      ChargeCategoryService.context,
    );

    const categoryId =
      dto.category_id ?? (await this.chargeCategoryDao.getNextCategoryId());

    const category = this.chargeCategoryDao.create({
      id: generateSnowflakeId(),
      category_id: categoryId,
      vehicle_weight: dto.vehicle_weight,
      engine_capacity: dto.engine_capacity,
      status: dto.status ?? 'Active',
      created_by: getCreatedById(actor),
    });

    return this.chargeCategoryDao.save(category);
  }

  async findAll(
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<ChargeCategory>> {
    return this.chargeCategoryDao.findPaginated(query);
  }

  async findOne(id: string): Promise<ChargeCategory> {
    const category = await this.chargeCategoryDao.findActiveById(id);
    if (!category) {
      throw new ResourceNotFoundException('ChargeCategory', id);
    }
    return category;
  }

  async update(
    id: string,
    dto: UpdateChargeCategoryDto,
  ): Promise<ChargeCategory> {
    const category = await this.findOne(id);
    Object.assign(category, dto);
    return this.chargeCategoryDao.save(category);
  }

  async remove(id: string): Promise<void> {
    const category = await this.findOne(id);
    category.is_deleted = true;
    await this.chargeCategoryDao.save(category);
  }
}
