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
      relations: { centre: true, vehicle: true },
    });
  }

  async findByChargeId(chargeId: number): Promise<Charge | null> {
    return this.findOne({ where: { charge_id: chargeId, is_deleted: false } });
  }

  async findByCombo(
    centreId: string | undefined,
    vehicleId: string,
    category: string,
  ): Promise<Charge | null> {
    return this.findOne({
      where: {
        centre_id: centreId ?? IsNull(),
        vehicle_id: vehicleId,
        category,
        is_deleted: false,
      },
    });
  }

  async findPaginated(query: PaginationQueryDto): Promise<PaginatedResult<Charge>> {
    const qb = this.createQueryBuilder('charge')
      .leftJoinAndSelect('charge.centre', 'centre')
      .leftJoinAndSelect('charge.vehicle', 'vehicle')
      .where('charge.is_deleted = :is_deleted', { is_deleted: false });

    const options = buildTypeOrmPaginationOptions<Charge, Charge>(query, {
      searchFields: ['charge.category', 'charge.status', 'centre.name', 'vehicle.name'],
      allowedSortFields: ['charge_id', 'category', 'status', 'validate_to', 'created_at', 'updated_at'],
      defaultSort: { created_at: 'DESC' },
    });

    const response = await this.paginationService.paginateQueryBuilder(qb, 'charge', options);
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
