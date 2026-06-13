import { DeepPartial } from 'typeorm';
import { PaginationQueryDto } from '../../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../../common/interfaces/pagination.interface';
import { Vehicle } from '../../../database/entity/vehicle.entity';

export interface IVehicleDao {
  create(entityLike: DeepPartial<Vehicle>): Vehicle;
  save(vehicle: Vehicle): Promise<Vehicle>;
  merge(vehicle: Vehicle, entityLike: DeepPartial<Vehicle>): Vehicle;
  findActiveById(id: string): Promise<Vehicle | null>;
  findByCode(code: string): Promise<Vehicle | null>;
  findByVinNo(vinNo: string): Promise<Vehicle | null>;
  findByVehicleId(vehicleId: number): Promise<Vehicle | null>;
  findPaginated(query: PaginationQueryDto): Promise<PaginatedResult<Vehicle>>;
  getNextVehicleId(): Promise<number>;
}
