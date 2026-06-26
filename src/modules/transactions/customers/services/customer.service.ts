import { Injectable } from '@nestjs/common';
import {
  CreateCustomerDto,
  UpdateCustomerDto,
} from '../../../../common/dto/customer.dto';
import { PaginationQueryDto } from '../../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../../common/interfaces/pagination.interface';
import {
  DatabaseException,
  DuplicateResourceException,
  ResourceNotFoundException,
} from '../../../../common/exceptions/custom.exception';
import { AppLogger } from '../../../../common/logger/app.logger';
import type { UserContext } from '../../../../common/dto/auth.dto';
import { getCreatedById } from '../../../../common/utils/created-by.util';
import { generateSnowflakeId } from '../../../../common/shared/snowflakeIdGeneration';
import { CustomerDao } from '../../../database/dao/customer.dao';
import { VehicleRecordDao } from '../../../database/dao/vehicle-record.dao';
import { Customer } from '../../../database/entity/customer.entity';
import { VehicleRecord } from '../../../database/entity/vehicle-record.entity';

@Injectable()
export class CustomerService {
  private static readonly context = 'CustomerService';

  constructor(
    private readonly customerDao: CustomerDao,
    private readonly vehicleRecordDao: VehicleRecordDao,
    private readonly logger: AppLogger,
  ) {}

  async create(createDto: CreateCustomerDto, actor: UserContext): Promise<Customer> {
    this.logger.log(`Creating customer: ${createDto.customer_name}`, CustomerService.context);

    try {
      let customerId = createDto.customer_id;
      if (!customerId) {
        customerId = await this.customerDao.getNextCustomerId();
      } else {
        const existing = await this.customerDao.findByCustomerId(customerId);
        if (existing) {
          throw new DuplicateResourceException('Customer', 'customer_id', customerId);
        }
      }

      const vehicleRecordId = await this.resolveVehicleRecord(createDto, undefined, actor);

      const customer = this.customerDao.create({
        id: generateSnowflakeId(),
        customer_id: customerId,
        customer_name: createDto.customer_name,
        phone: createDto.phone,
        alternate_phone: createDto.alternate_phone,
        owner_name: createDto.owner_name,
        owner_phone_number: createDto.owner_phone_number,
        id_number: createDto.id_number,
        chassis_no: createDto.chassis_no,
        mulkiya_id: createDto.mulkiya_id,
        vehicle_record_id: vehicleRecordId,
        created_by: getCreatedById(actor),
      });

      const saved = await this.customerDao.save(customer);
      this.logger.log(`Customer created with ID: ${saved.id}`, CustomerService.context);
      return (await this.customerDao.findActiveById(saved.id)) ?? saved;
    } catch (error) {
      if (
        error instanceof DuplicateResourceException ||
        error instanceof ResourceNotFoundException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to create customer: ${(error as Error).message}`,
        (error as Error).stack,
        CustomerService.context,
      );
      throw new DatabaseException('Failed to create customer. Please try again.');
    }
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<Customer>> {
    this.logger.log(
      `Fetching customers — page: ${query.page}, limit: ${query.limit}`,
      CustomerService.context,
    );

    try {
      return await this.customerDao.findPaginated(query);
    } catch (error) {
      this.logger.error(
        `Failed to fetch customers: ${(error as Error).message}`,
        (error as Error).stack,
        CustomerService.context,
      );
      throw new DatabaseException('Failed to fetch customers. Please try again.');
    }
  }

  async findOne(id: string): Promise<Customer> {
    this.logger.log(`Fetching customer ID: ${id}`, CustomerService.context);

    try {
      const customer = await this.customerDao.findActiveById(id);
      if (!customer) {
        throw new ResourceNotFoundException('Customer', id);
      }
      return customer;
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to fetch customer: ${(error as Error).message}`,
        (error as Error).stack,
        CustomerService.context,
      );
      throw new DatabaseException('Failed to fetch customer. Please try again.');
    }
  }

  async update(id: string, updateDto: UpdateCustomerDto, actor: UserContext): Promise<Customer> {
    this.logger.log(`Updating customer ID: ${id}`, CustomerService.context);

    try {
      const customer = await this.findOne(id);
      const vehicleRecordId = await this.resolveVehicleRecord(updateDto, customer, actor);

      const merged = this.customerDao.merge(customer, {
        customer_name: updateDto.customer_name,
        phone: updateDto.phone,
        alternate_phone: updateDto.alternate_phone,
        owner_name: updateDto.owner_name,
        owner_phone_number: updateDto.owner_phone_number,
        id_number: updateDto.id_number,
        chassis_no: updateDto.chassis_no,
        mulkiya_id: updateDto.mulkiya_id,
        ...(vehicleRecordId !== undefined
          ? { vehicle_record_id: vehicleRecordId }
          : {}),
      });

      const saved = await this.customerDao.save(merged);
      this.logger.log(`Customer updated ID: ${saved.id}`, CustomerService.context);
      return (await this.customerDao.findActiveById(saved.id)) ?? saved;
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to update customer: ${(error as Error).message}`,
        (error as Error).stack,
        CustomerService.context,
      );
      throw new DatabaseException('Failed to update customer. Please try again.');
    }
  }

  async remove(id: string): Promise<void> {
    this.logger.log(`Deleting customer ID: ${id}`, CustomerService.context);

    try {
      const customer = await this.findOne(id);
      customer.is_deleted = true;
      await this.customerDao.save(customer);
      this.logger.log(`Customer soft-deleted ID: ${id}`, CustomerService.context);
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to delete customer: ${(error as Error).message}`,
        (error as Error).stack,
        CustomerService.context,
      );
      throw new DatabaseException('Failed to delete customer. Please try again.');
    }
  }

  private async resolveVehicleRecord(
    dto: CreateCustomerDto | UpdateCustomerDto,
    existing: Customer | undefined,
    actor?: UserContext,
  ): Promise<string | null | undefined> {
    if (dto.vehicle_record_id) {
      const vehicleRecord = await this.vehicleRecordDao.findActiveById(
        dto.vehicle_record_id,
      );
      if (!vehicleRecord) {
        throw new ResourceNotFoundException('VehicleRecord', dto.vehicle_record_id);
      }
      return dto.vehicle_record_id;
    }

    if (!dto.plate_number) {
      return undefined;
    }

    const normalizedPlate = dto.plate_number.trim();
    let vehicleRecord = await this.vehicleRecordDao.findByPlateNumber(normalizedPlate);

    if (vehicleRecord) {
      if (dto.plate_color) {
        vehicleRecord = this.vehicleRecordDao.merge(vehicleRecord, {
          plate_color: dto.plate_color,
        });
        vehicleRecord = await this.vehicleRecordDao.save(vehicleRecord);
      }
      return vehicleRecord.id;
    }

    if (!actor) {
      throw new DatabaseException('Authenticated user is required to create a vehicle record.');
    }
    const createdRecord = await this.createVehicleRecordFromPlate(
      normalizedPlate,
      dto.plate_color,
      actor,
    );
    return createdRecord.id;
  }

  private async createVehicleRecordFromPlate(
    plateNumber: string,
    plateColor: string | undefined,
    actor: UserContext,
  ): Promise<VehicleRecord> {
    const vehicleRecordId = await this.vehicleRecordDao.getNextVehicleRecordId();
    const vehicleRecord = this.vehicleRecordDao.create({
      id: generateSnowflakeId(),
      vehicle_record_id: vehicleRecordId,
      plate_number: plateNumber,
      plate_color: plateColor?.trim(),
      created_by: getCreatedById(actor),
    });

    return this.vehicleRecordDao.save(vehicleRecord);
  }
}
