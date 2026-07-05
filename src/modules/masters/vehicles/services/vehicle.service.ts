import { Injectable } from '@nestjs/common';

import { AppLogger } from '../../../../common/logger/app.logger';
import { getCreatedById } from '../../../../common/utils/created-by.util';
import { PaginatedResult } from '../../../../common/interfaces/pagination.interface';
import { generateSnowflakeId } from '../../../../common/shared/snowflakeIdGeneration';
import { generateVehicleCode } from '../../../../common/utils/generate-vehicle-code.util';

import { Vehicle } from '../../../database/entity/vehicle.entity';

import { IVehicleService } from './vehicle.service.interface';
import { VehicleDao } from '../../../database/dao/vehicle.dao';
import { ChargeCategoryDao } from '../../../database/dao/charge-category.dao';

import type { UserContext } from '../../../../common/dto/auth.dto';
import { PaginationQueryDto } from '../../../../common/dto/pagination.dto';
import {
  CreateVehicleDto,
  UpdateVehicleDto,
} from '../../../../common/dto/vehicle.dto';
import {
  DatabaseException,
  DuplicateResourceException,
  ResourceNotFoundException,
} from '../../../../common/exceptions/custom.exception';

@Injectable()
export class VehicleService implements IVehicleService {
  constructor(
    private readonly logger: AppLogger,
    private readonly vehicleDao: VehicleDao,
    private readonly chargeCategoryDao: ChargeCategoryDao,
  ) {}

  /**
   * Resolve the vehicle-type classification code from the vehicle type + the
   * linked charge category's weight. This code is the identity of the record —
   * same type + category → same code → blocked by the unique code index.
   */
  private async resolveVehicleCode(
    vehicleType: string,
    chargeCategoryId: string,
  ): Promise<string> {
    const category =
      await this.chargeCategoryDao.findActiveById(chargeCategoryId);
    if (!category) {
      throw new ResourceNotFoundException('ChargeCategory', chargeCategoryId);
    }
    return generateVehicleCode(vehicleType, category.vehicle_weight);
  }

  async create(
    createVehicleDto: CreateVehicleDto,
    actor: UserContext,
  ): Promise<Vehicle> {
    this.logger.log(
      `Creating vehicle master: ${createVehicleDto.vehicle_type}`,
    );

    try {
      // Code is derived from type + category; it is the duplicate key.
      const code = await this.resolveVehicleCode(
        createVehicleDto.vehicle_type,
        createVehicleDto.charge_category_id,
      );
      const existingCode = await this.vehicleDao.findByCode(code);
      if (existingCode) {
        throw new DuplicateResourceException(
          'Vehicle',
          'type and category',
          code,
        );
      }

      if (createVehicleDto.vin_no) {
        const existingVin = await this.vehicleDao.findByVinNo(
          createVehicleDto.vin_no,
        );
        if (existingVin) {
          throw new DuplicateResourceException(
            'Vehicle',
            'vin_no',
            createVehicleDto.vin_no,
          );
        }
      }

      let vehicle_id = createVehicleDto.vehicle_id;
      if (!vehicle_id) {
        vehicle_id = await this.vehicleDao.getNextVehicleId();
      } else {
        const existingVehicleId =
          await this.vehicleDao.findByVehicleId(vehicle_id);
        if (existingVehicleId) {
          throw new DuplicateResourceException(
            'Vehicle',
            'vehicle_id',
            vehicle_id,
          );
        }
      }

      const vehicle = this.vehicleDao.create({
        id: generateSnowflakeId(),
        ...createVehicleDto,
        code,
        vehicle_id,
        status: createVehicleDto.status ?? 'Active',
        description: createVehicleDto.description ?? '',
        created_by: getCreatedById(actor) ? getCreatedById(actor) : 'system',
      });
      const savedVehicle = await this.vehicleDao.save(vehicle);

      this.logger.log(`Vehicle master created with ID: ${savedVehicle.id}`);
      return savedVehicle;
    } catch (error) {
      if (
        error instanceof DuplicateResourceException ||
        error instanceof ResourceNotFoundException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to create vehicle master: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw new DatabaseException(
        'Failed to create vehicle master. Please try again.',
      );
    }
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<Vehicle>> {
    this.logger.log(
      `Fetching vehicle masters — page: ${query.page}, limit: ${query.limit}`,
    );

    try {
      return await this.vehicleDao.findPaginated(query);
    } catch (error) {
      this.logger.error(
        `Failed to fetch vehicle masters: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw new DatabaseException(
        'Failed to fetch vehicle masters. Please try again.',
      );
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
        (error as Error).stack,
      );
      throw new DatabaseException(
        'Failed to fetch vehicle master. Please try again.',
      );
    }
  }

  async update(
    id: string,
    updateVehicleDto: UpdateVehicleDto,
  ): Promise<Vehicle> {
    this.logger.log(`Updating vehicle master ID: ${id}`);

    try {
      const vehicle = await this.findOne(id);

      // Recompute the code from the resulting type + category (either may change).
      const effectiveType =
        updateVehicleDto.vehicle_type ?? vehicle.vehicle_type ?? '';
      const effectiveCategoryId =
        updateVehicleDto.charge_category_id ?? vehicle.charge_category_id ?? '';
      const code = effectiveCategoryId
        ? await this.resolveVehicleCode(effectiveType, effectiveCategoryId)
        : vehicle.code;
      if (code !== vehicle.code) {
        const existingCode = await this.vehicleDao.findByCode(code);
        if (existingCode && existingCode.id !== id) {
          throw new DuplicateResourceException(
            'Vehicle',
            'type and category',
            code,
          );
        }
      }

      if (
        updateVehicleDto.vin_no &&
        updateVehicleDto.vin_no !== vehicle.vin_no
      ) {
        const existingVin = await this.vehicleDao.findByVinNo(
          updateVehicleDto.vin_no,
        );
        if (existingVin) {
          throw new DuplicateResourceException(
            'Vehicle',
            'vin_no',
            updateVehicleDto.vin_no,
          );
        }
      }

      const mergedVehicle = this.vehicleDao.merge(vehicle, {
        ...updateVehicleDto,
        code,
      });
      // Detach the stale ManyToOne relation so a changed charge_category_id FK
      // isn't overwritten by the previously-loaded chargeCategory entity on save.
      if (
        updateVehicleDto.charge_category_id !== undefined &&
        updateVehicleDto.charge_category_id !== vehicle.charge_category_id
      ) {
        (mergedVehicle as { chargeCategory?: unknown }).chargeCategory =
          undefined;
      }
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
        (error as Error).stack,
      );
      throw new DatabaseException(
        'Failed to update vehicle master. Please try again.',
      );
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
        (error as Error).stack,
      );
      throw new DatabaseException(
        'Failed to delete vehicle master. Please try again.',
      );
    }
  }
}
