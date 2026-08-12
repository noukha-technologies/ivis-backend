import { Injectable } from '@nestjs/common';
import { DataSource, IsNull, Repository } from 'typeorm';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../common/interfaces/pagination.interface';
import {
  buildTypeOrmPaginationOptions,
  toPaginatedResult,
} from '../../../common/shared/pagination/pagination-query.util';
import { PaginationService } from '../../../common/shared/pagination/pagination.service';
import { IChargeDao } from '../../masters/charges/dao/charge.dao.interface';
import { Charge } from '../entity/charge.entity';
import { ChargeCategory } from '../entity/charge-category.entity';

@Injectable()
export class ChargeDao extends Repository<Charge> implements IChargeDao {
  constructor(
    private readonly dataSource: DataSource,
    private readonly paginationService: PaginationService,
  ) {
    super(Charge, dataSource.createEntityManager());
  }

  async findActiveById(id: string): Promise<Charge | null> {
    return this.findOne({
      where: { id, is_deleted: false },
      relations: { centre: true, chargeCategory: true },
    });
  }

  async findByChargeId(chargeId: number): Promise<Charge | null> {
    return this.findOne({ where: { charge_id: chargeId, is_deleted: false } });
  }

  async findByCombo(
    centreId: string | undefined,
    vehicleType: string,
    chargeCategoryId: string,
  ): Promise<Charge | null> {
    return this.findOne({
      where: {
        centre_id: centreId ?? IsNull(),
        vehicle_type: vehicleType,
        charge_category_id: chargeCategoryId,
        is_deleted: false,
      },
    });
  }

  /**
   * Resolve the applicable charge by vehicle type alone (used when no charge
   * category is known, e.g. walk-ins without a vehicle master). Prefers a
   * centre-specific charge, then falls back to a global (null-centre) charge.
   */
  async findByVehicleType(
    centreId: string | undefined,
    vehicleType: string,
  ): Promise<Charge | null> {
    const base = {
      vehicle_type: vehicleType,
      status: 'Active',
      is_enabled: true,
      is_deleted: false,
    };
    if (centreId) {
      const centreCharge = await this.findOne({
        where: { ...base, centre_id: centreId },
      });
      if (centreCharge) return centreCharge;
    }
    return this.findOne({ where: { ...base, centre_id: IsNull() } });
  }

  /**
   * Distinct Active charge categories mapped to a vehicle type via Active,
   * enabled Charges Master rows (case-insensitive type match).
   */
  async findActiveCategoriesByVehicleType(
    vehicleType: string,
  ): Promise<ChargeCategory[]> {
    const rows = await this.createQueryBuilder('charge')
      .innerJoinAndSelect('charge.chargeCategory', 'chargeCategory')
      .where('charge.is_deleted = :isDeleted', { isDeleted: false })
      .andWhere('charge.status = :status', { status: 'Active' })
      .andWhere('charge.is_enabled = :isEnabled', { isEnabled: true })
      .andWhere('LOWER(TRIM(charge.vehicle_type)) = :vehicleType', {
        vehicleType,
      })
      .andWhere('charge.charge_category_id IS NOT NULL')
      .andWhere('chargeCategory.is_deleted = :catDeleted', {
        catDeleted: false,
      })
      .andWhere('chargeCategory.status = :catStatus', { catStatus: 'Active' })
      .orderBy('chargeCategory.vehicle_weight', 'ASC')
      .addOrderBy('chargeCategory.engine_capacity', 'ASC')
      .getMany();

    const unique = new Map<string, ChargeCategory>();
    for (const row of rows) {
      if (row.chargeCategory) {
        unique.set(row.chargeCategory.id, row.chargeCategory);
      }
    }
    return [...unique.values()];
  }

  /**
   * Distinct vehicle types from Active, enabled Charges Master rows.
   */
  async findDistinctActiveVehicleTypes(): Promise<string[]> {
    const rows = await this.createQueryBuilder('charge')
      .select('DISTINCT LOWER(TRIM(charge.vehicle_type))', 'vehicle_type')
      .where('charge.is_deleted = :isDeleted', { isDeleted: false })
      .andWhere('charge.status = :status', { status: 'Active' })
      .andWhere('charge.is_enabled = :isEnabled', { isEnabled: true })
      .andWhere("TRIM(charge.vehicle_type) <> ''")
      .orderBy('vehicle_type', 'ASC')
      .getRawMany<{ vehicle_type: string }>();

    return rows
      .map((row) => row.vehicle_type)
      .filter((type): type is string => Boolean(type));
  }

  async findPaginated(
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<Charge>> {
    const qb = this.createQueryBuilder('charge')
      .leftJoinAndSelect('charge.centre', 'centre')
      .leftJoinAndSelect('charge.chargeCategory', 'chargeCategory')
      .where('charge.is_deleted = :is_deleted', { is_deleted: false });

    const options = buildTypeOrmPaginationOptions<Charge, Charge>(query, {
      searchFields: [
        'charge.category',
        'charge.vehicle_type',
        'charge.status',
        'centre.centre_name',
        'chargeCategory.vehicle_weight',
        'chargeCategory.engine_capacity',
      ],
      allowedSortFields: [
        'charge_id',
        'category',
        'status',
        'validate_to',
        'created_at',
        'updated_at',
      ],
      defaultSort: { created_at: 'DESC' },
    });

    const response = await this.paginationService.paginateQueryBuilder(
      qb,
      'charge',
      options,
    );
    return toPaginatedResult(response);
  }

  async getNextChargeId(): Promise<number> {
    const result = await this.createQueryBuilder('charge')
      .select('MAX(charge.charge_id)', 'max')
      .getRawOne();
    const max = result?.max ? Number(result.max) : 0;
    return max + 1;
  }
}
