import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../common/interfaces/pagination.interface';
import {
  buildTypeOrmPaginationOptions,
  toPaginatedResult,
} from '../../../common/shared/pagination/pagination-query.util';
import { PaginationService } from '../../../common/shared/pagination/pagination.service';
import { IVehicleDao } from '../../masters/vehicles/dao/vehicle.dao.interface';
import { Vehicle } from '../entity/vehicle.entity';

@Injectable()
export class VehicleDao extends Repository<Vehicle> implements IVehicleDao {
  constructor(
    private readonly dataSource: DataSource,
    private readonly paginationService: PaginationService,
  ) {
    super(Vehicle, dataSource.createEntityManager());
  }

  async findActiveById(id: string): Promise<Vehicle | null> {
    return this.findOne({
      where: { id, is_deleted: false },
      relations: { chargeCategory: true },
    });
  }

  async findByCode(code: string): Promise<Vehicle | null> {
    return this.findOne({ where: { code, is_deleted: false } });
  }

  async findByVinNo(vinNo: string): Promise<Vehicle | null> {
    return this.findOne({ where: { vin_no: vinNo, is_deleted: false } });
  }

  async findByVehicleId(vehicleId: number): Promise<Vehicle | null> {
    return this.findOne({
      where: { vehicle_id: vehicleId, is_deleted: false },
    });
  }

  async findPaginated(
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<Vehicle>> {
    const options = buildTypeOrmPaginationOptions<Vehicle, Vehicle>(query, {
      searchFields: ['name', 'code', 'vin_no', 'status', 'description'],
      allowedSortFields: [
        'vehicle_id',
        'name',
        'code',
        'vin_no',
        'status',
        'description',
        'created_at',
        'updated_at',
      ],
      defaultSort: { created_at: 'DESC' },
      baseWhere: { is_deleted: false },
    });

    const response = await this.paginationService.paginate(
      this,
      'vehicle',
      options,
    );
    return toPaginatedResult(response);
  }

  async getNextVehicleId(): Promise<number> {
    const result = await this.createQueryBuilder('vehicle')
      .select('MAX(vehicle.vehicle_id)', 'max')
      .getRawOne();
    const max = result?.max ? Number(result.max) : 0;
    return max + 1;
  }
}
