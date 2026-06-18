import { Injectable } from '@nestjs/common';

import { AppLogger } from '../../../../common/logger/app.logger';
import { getCreatedById } from '../../../../common/utils/created-by.util';
import { PaginatedResult } from '../../../../common/interfaces/pagination.interface';
import { generateSnowflakeId } from '../../../../common/shared/snowflakeIdGeneration';

import { Vehicle } from '../../../database/entity/vehicle.entity';

import { IVehicleService } from './vehicle.service.interface';
import { VehicleDao } from '../../../database/dao/vehicle.dao';

import type { UserContext } from '../../../../common/dto/auth.dto';
import { PaginationQueryDto } from '../../../../common/dto/pagination.dto';
import { CreateVehicleDto, UpdateVehicleDto } from '../../../../common/dto/vehicle.dto';
import { DatabaseException, DuplicateResourceException, ResourceNotFoundException } from '../../../../common/exceptions/custom.exception';

@Injectable()
export class VehicleService implements IVehicleService {
  constructor(
    private readonly logger: AppLogger,
    private readonly vehicleDao: VehicleDao,
  ) { }

  async create(createVehicleDto: CreateVehicleDto, actor: UserContext): Promise<Vehicle> {
    this.logger.log(`Creating vehicle master with code: ${createVehicleDto.code}`);

    try {
      const existingCode = await this.vehicleDao.findByCode(createVehicleDto.code);
      if (existingCode) {
        throw new DuplicateResourceException('Vehicle', 'code', createVehicleDto.code);
      }

      if (createVehicleDto.vin_no) {
        const existingVin = await this.vehicleDao.findByVinNo(createVehicleDto.vin_no);
        if (existingVin) {
          throw new DuplicateResourceException('Vehicle', 'vin_no', createVehicleDto.vin_no);
        }
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
        status: createVehicleDto.status ?? 'Active',
        description: createVehicleDto.description ?? "",
        created_by: getCreatedById(actor) ? getCreatedById(actor) : 'system',
      });
      const savedVehicle = await this.vehicleDao.save(vehicle);

      this.logger.log(`Vehicle master created with ID: ${savedVehicle.id}`);
      return savedVehicle;
    } catch (error) {
      if (error instanceof DuplicateResourceException) {
        throw error;
      }
      this.logger.error(`Failed to create vehicle master: ${(error as Error).message}`, (error as Error).stack);
      throw new DatabaseException('Failed to create vehicle master. Please try again.');
    }
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<Vehicle>> {
    this.logger.log(`Fetching vehicle masters — page: ${query.page}, limit: ${query.limit}`);

    try {
      return await this.vehicleDao.findPaginated(query);
    } catch (error) {
      this.logger.error(
        `Failed to fetch vehicle masters: ${(error as Error).message}`,
        (error as Error).stack
      );
      throw new DatabaseException('Failed to fetch vehicle masters. Please try again.');
    }
  }

  async findOne(id: string): Promise<Vehicle> {
    this.logger.log(`Fetching vehicle master ID: ${id}`);

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
        `Failed to fetch vehicle master: ${(error as Error).message}`,
        (error as Error).stack
      );
      throw new DatabaseException('Failed to fetch vehicle master. Please try again.');
    }
  }

  async update(id: string, updateVehicleDto: UpdateVehicleDto): Promise<Vehicle> {
    this.logger.log(`Updating vehicle master ID: ${id}`);

    try {
      const vehicle = await this.findOne(id);

      if (updateVehicleDto.code && updateVehicleDto.code !== vehicle.code) {
        const existingCode = await this.vehicleDao.findByCode(updateVehicleDto.code);
        if (existingCode) {
          throw new DuplicateResourceException('Vehicle', 'code', updateVehicleDto.code);
        }
      }

      if (updateVehicleDto.vin_no && updateVehicleDto.vin_no !== vehicle.vin_no) {
        const existingVin = await this.vehicleDao.findByVinNo(updateVehicleDto.vin_no);
        if (existingVin) {
          throw new DuplicateResourceException('Vehicle', 'vin_no', updateVehicleDto.vin_no);
        }
      }

      const mergedVehicle = this.vehicleDao.merge(vehicle, updateVehicleDto);
      const savedVehicle = await this.vehicleDao.save(mergedVehicle);

      this.logger.log(`Vehicle master updated ID: ${savedVehicle.id}`);
      return savedVehicle;
    } catch (error) {
      if (
        error instanceof ResourceNotFoundException ||
        error instanceof DuplicateResourceException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to update vehicle master: ${(error as Error).message}`,
        (error as Error).stack
      );
      throw new DatabaseException('Failed to update vehicle master. Please try again.');
    }
  }

  async remove(id: string): Promise<void> {
    this.logger.log(`Deleting vehicle master ID: ${id}`);

    try {
      const vehicle = await this.findOne(id);
      vehicle.is_deleted = true;
      await this.vehicleDao.save(vehicle);
      this.logger.log(`Vehicle master soft-deleted ID: ${id}`);
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to delete vehicle master: ${(error as Error).message}`,
        (error as Error).stack
      );
      throw new DatabaseException('Failed to delete vehicle master. Please try again.');
    }
  }
}
