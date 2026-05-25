import { CreateVehicleDto, UpdateVehicleDto } from '../../../../common/dto/vehicle.dto';
import { PaginationQueryDto } from '../../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../../common/interfaces/pagination.interface';
import { Vehicle } from '../../../database/entity/vehicle.entity';

export interface IVehicleService {
  create(createVehicleDto: CreateVehicleDto): Promise<Vehicle>;
  findAll(query: PaginationQueryDto): Promise<PaginatedResult<Vehicle>>;
  findOne(id: string): Promise<Vehicle>;
  findByPlateNumber(plateNumber: string): Promise<Vehicle | null>;
  update(id: string, updateVehicleDto: UpdateVehicleDto): Promise<Vehicle>;
  remove(id: string): Promise<void>;
}
