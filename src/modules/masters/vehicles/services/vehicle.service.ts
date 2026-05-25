import { Injectable } from '@nestjs/common';
import { CreateVehicleDto, UpdateVehicleDto } from '../../../../common/dto/vehicle.dto';
import { PaginationQueryDto } from '../../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../../common/interfaces/pagination.interface';
import {
  DatabaseException,
  DuplicateResourceException,
  ResourceNotFoundException,
} from '../../../../common/exceptions/custom.exception';
import { AppLogger } from '../../../../common/logger/app.logger';
import { generateSnowflakeId } from '../../../../common/shared/snowflakeIdGeneration';
import { Vehicle } from '../../../database/entity/vehicle.entity';
import { VehicleDao } from '../../../database/dao/vehicle.dao';
import { IVehicleService } from './vehicle.service.interface';

@Injectable()
export class VehicleService implements IVehicleService {
  private static readonly context = 'VehicleService';

  constructor(
    private readonly vehicleDao: VehicleDao,
    private readonly logger: AppLogger,
  ) {}

  async create(createVehicleDto: CreateVehicleDto): Promise<Vehicle> {
    this.logger.log(
      `Creating vehicle with plate: ${createVehicleDto.plate_number}`,
      VehicleService.context,
    );

    try {
      const existingPlate = await this.vehicleDao.findByPlateNumber(
        createVehicleDto.plate_number,
      );
      if (existingPlate) {
        throw new DuplicateResourceException(
          'Vehicle',
          'plate_number',
          createVehicleDto.plate_number,
        );
      }

      let vehicle_id = createVehicleDto.vehicle_id;
      if (!vehicle_id) {
        vehicle_id = await this.vehicleDao.getNextVehicleId();
      } else {
        const existingVehicleId = await this.vehicleDao.findByVehicleId(vehicle_id);
        if (existingVehicleId) {
          throw new DuplicateResourceException('Vehicle', 'vehicle_id', vehicle_id);
        }
      }

      const vehicle = this.vehicleDao.create({
        id: generateSnowflakeId(),
        ...createVehicleDto,
        vehicle_id,
      });
      const savedVehicle = await this.vehicleDao.save(vehicle);

      this.logger.log(`Vehicle created with ID: ${savedVehicle.id}`, VehicleService.context);
      return savedVehicle;
    } catch (error) {
      if (error instanceof DuplicateResourceException) {
        throw error;
      }
      this.logger.error(
        `Failed to create vehicle: ${(error as Error).message}`,
        (error as Error).stack,
        VehicleService.context,
      );
      throw new DatabaseException('Failed to create vehicle. Please try again.');
    }
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<Vehicle>> {
    this.logger.log(
      `Fetching vehicles — page: ${query.page}, limit: ${query.limit}`,
      VehicleService.context,
    );

    try {
      return await this.vehicleDao.findPaginated(query);
    } catch (error) {
      this.logger.error(
        `Failed to fetch vehicles: ${(error as Error).message}`,
        (error as Error).stack,
        VehicleService.context,
      );
      throw new DatabaseException('Failed to fetch vehicles. Please try again.');
    }
  }

  async findOne(id: string): Promise<Vehicle> {
    this.logger.log(`Fetching vehicle ID: ${id}`, VehicleService.context);

    try {
      const vehicle = await this.vehicleDao.findActiveById(id);
      if (!vehicle) {
        throw new ResourceNotFoundException('Vehicle', id);
      }
      return vehicle;
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to fetch vehicle: ${(error as Error).message}`,
        (error as Error).stack,
        VehicleService.context,
      );
      throw new DatabaseException('Failed to fetch vehicle. Please try again.');
    }
  }

  async findByPlateNumber(plateNumber: string): Promise<Vehicle | null> {
    this.logger.log(`Lookup by plate number: ${plateNumber}`, VehicleService.context);

    try {
      return await this.vehicleDao.findByPlateNumber(plateNumber);
    } catch (error) {
      this.logger.error(
        `Failed to find vehicle by plate: ${(error as Error).message}`,
        (error as Error).stack,
        VehicleService.context,
      );
      throw new DatabaseException('Failed to look up vehicle by plate number.');
    }
  }

  async update(id: string, updateVehicleDto: UpdateVehicleDto): Promise<Vehicle> {
    this.logger.log(`Updating vehicle ID: ${id}`, VehicleService.context);

    try {
      const vehicle = await this.findOne(id);

      if (
        updateVehicleDto.plate_number &&
        updateVehicleDto.plate_number !== vehicle.plate_number
      ) {
        const existingPlate = await this.vehicleDao.findByPlateNumber(
          updateVehicleDto.plate_number,
        );
        if (existingPlate) {
          throw new DuplicateResourceException(
            'Vehicle',
            'plate_number',
            updateVehicleDto.plate_number,
          );
        }
      }

      const mergedVehicle = this.vehicleDao.merge(vehicle, updateVehicleDto);
      const savedVehicle = await this.vehicleDao.save(mergedVehicle);

      this.logger.log(`Vehicle updated ID: ${savedVehicle.id}`, VehicleService.context);
      return savedVehicle;
    } catch (error) {
      if (
        error instanceof ResourceNotFoundException ||
        error instanceof DuplicateResourceException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to update vehicle: ${(error as Error).message}`,
        (error as Error).stack,
        VehicleService.context,
      );
      throw new DatabaseException('Failed to update vehicle. Please try again.');
    }
  }

  async remove(id: string): Promise<void> {
    this.logger.log(`Deleting vehicle ID: ${id}`, VehicleService.context);

    try {
      const vehicle = await this.findOne(id);
      vehicle.is_deleted = true;
      await this.vehicleDao.save(vehicle);
      this.logger.log(`Vehicle soft-deleted ID: ${id}`, VehicleService.context);
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to delete vehicle: ${(error as Error).message}`,
        (error as Error).stack,
        VehicleService.context,
      );
      throw new DatabaseException('Failed to delete vehicle. Please try again.');
    }
  }
}
