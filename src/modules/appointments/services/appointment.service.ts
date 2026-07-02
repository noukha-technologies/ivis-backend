import { Injectable } from '@nestjs/common';

import type { UserContext } from '../../../common/dto/auth.dto';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { CreateAppointmentDto, UpdateAppointmentDto } from '../../../common/dto/appointment.dto';

import { AppLogger } from '../../../common/logger/app.logger';
import { getCreatedById } from '../../../common/utils/created-by.util';
import { generateSnowflakeId } from '../../../common/shared/snowflakeIdGeneration';
import { generateIdNumber } from '../../../common/shared/id-number.util';
import {
  DatabaseException,
  DuplicateResourceException,
  ResourceNotFoundException
} from '../../../common/exceptions/custom.exception';

import { LineDao } from '../../database/dao/line.dao';
import { CentreDao } from '../../database/dao/centre.dao';
import { CustomerDao } from '../../database/dao/customer.dao';
import { AppointmentDao } from '../../database/dao/appointment.dao';
import { AnprCaptureDao } from '../../database/dao/anpr-capture.dao';
import { PaymentTypeDao } from '../../database/dao/payment-type.dao';
import { VehicleRecordDao } from '../../database/dao/vehicle-record.dao';

export interface PlateLookupResult {
  plate_number: string;
  owner_name: string | null;
  owner_phone: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  id_number: string | null;
  plate_color: string | null;
  vehicle_type: string | null;
  chassis_no: string | null;
  charge_category_id: string | null;
}

import { Appointment } from '../../database/entity/appointment.entity';
import { PaginatedResult } from '../../../common/interfaces/pagination.interface';
import { AppointmentStatus, BookingType } from 'src/common/enums/common.enums';

@Injectable()
export class AppointmentService {
  private static readonly context = 'AppointmentService';

  constructor(
    private readonly lineDao: LineDao,
    private readonly logger: AppLogger,
    private readonly centreDao: CentreDao,
    private readonly customerDao: CustomerDao,
    private readonly appointmentDao: AppointmentDao,
    private readonly anprCaptureDao: AnprCaptureDao,
    private readonly paymentTypeDao: PaymentTypeDao,
    private readonly vehicleRecordDao: VehicleRecordDao,
  ) { }

  /**
   * Resolve known vehicle + customer details for a plate from the vehicle
   * records (and the linked customer / vehicle master). Used by the walk-in
   * drawer to auto-fill fields. Returns null when no record exists for the plate.
   */
  async resolveByPlate(plate: string): Promise<PlateLookupResult | null> {
    const p = plate?.trim();
    if (!p) return null;

    const record = await this.vehicleRecordDao.findByPlateNumber(p);
    if (!record) return null;

    const customer = await this.customerDao.findByVehicleRecordId(record.id);

    // Plate colour is sourced from the ANPR capture (camera read); fall back to
    // the vehicle record if the latest capture has none.
    const latestCapture = await this.anprCaptureDao.findLatestByPlate(p);

    return {
      plate_number: record.plate_number,
      owner_name: customer?.owner_name ?? null,
      owner_phone: customer?.owner_phone_number ?? null,
      customer_name: customer?.owner_name ?? null,
      customer_phone: customer?.owner_phone_number ?? null,
      id_number: customer?.id_number ?? customer?.mulkiya_id ?? null,
      plate_color: latestCapture?.plate_color ?? record.plate_color ?? null,
      vehicle_type: record.vehicle_type ?? record.vehicleMaster?.vehicle_type ?? null,
      chassis_no: record.chassis_no ?? null,
      charge_category_id: record.vehicleMaster?.charge_category_id ?? null,
    };
  }

  async create(createDto: CreateAppointmentDto, actor: UserContext): Promise<Appointment> {
    this.logger.log('Creating appointment', AppointmentService.context);

    try {
      await this.validateReferences(createDto);

      let appointmentId = createDto.appointment_id;
      if (!appointmentId) {
        appointmentId = await this.appointmentDao.getNextAppointmentId();
      } else {
        const existing = await this.appointmentDao.findByAppointmentId(appointmentId);
        if (existing) {
          throw new DuplicateResourceException('Appointment', 'appointment_id', appointmentId);
        }
      }

      // Resolve the plate (from the DTO or the linked ANPR capture).
      let plateNumber = createDto.plate_number;
      let capture = null;
      if (createDto.anpr_capture_id) {
        capture = await this.anprCaptureDao.findActiveById(createDto.anpr_capture_id);
        if (!capture) {
          throw new ResourceNotFoundException('AnprCapture', createDto.anpr_capture_id);
        }
        plateNumber = plateNumber || capture.plate_number;
      }

      // Ensure a vehicle record exists for the plate and carries the ANPR/DTO
      // vehicle type + chassis (#6 — ANPR vehicle type flows into the record).
      const vehicleRecordId = await this.ensureVehicleRecord(
        createDto.vehicle_record_id,
        plateNumber,
        createDto.vehicle_type ?? capture?.vehicle_type ?? undefined,
        createDto.chassis_no,
        actor,
      );

      // Create / link the customer with all entered details (#4) and link it to
      // the vehicle record. The appointment then only stores the customer id.
      // Walk-ins may be created without customer details — those are filled later
      // via the customer popup (PATCH), so only link a customer when we have one.
      const hasCustomer = !!(
        createDto.customer_id ||
        (createDto.customer_name && createDto.customer_phone)
      );
      const customerId = hasCustomer
        ? await this.ensureCustomer(createDto, vehicleRecordId, actor)
        : undefined;

      const appointment = this.appointmentDao.create({
        id: generateSnowflakeId(),
        appointment_id: appointmentId,
        anpr_capture_id: createDto.anpr_capture_id,
        customer_id: customerId,
        vehicle_record_id: vehicleRecordId,
        centre_id: createDto.centre_id,
        line_id: createDto.line_id,
        appointment_at: new Date(createDto.appointment_at),
        status: AppointmentStatus.QUEUED,
        notes: createDto.notes,
        booking_type: createDto.booking_type ?? BookingType.WALK_IN,
        created_by: getCreatedById(actor),
      });

      const saved = await this.appointmentDao.save(appointment);
      this.logger.log(`Appointment created ID: ${saved.id}`, AppointmentService.context);
      return (await this.appointmentDao.findActiveById(saved.id)) ?? saved;
    } catch (error) {
      if (
        error instanceof DuplicateResourceException ||
        error instanceof ResourceNotFoundException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to create appointment: ${(error as Error).message}`,
        (error as Error).stack,
        AppointmentService.context,
      );
      throw new DatabaseException('Failed to create appointment. Please try again.');
    }
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<Appointment>> {
    try {
      return await this.appointmentDao.findPaginated(query);
    } catch (error) {
      this.logger.error(
        `Failed to fetch appointments: ${(error as Error).message}`,
        (error as Error).stack,
        AppointmentService.context,
      );
      throw new DatabaseException('Failed to fetch appointments. Please try again.');
    }
  }

  async findOne(id: string): Promise<Appointment> {
    const appointment = await this.appointmentDao.findActiveById(id);
    if (!appointment) {
      throw new ResourceNotFoundException('Appointment', id);
    }
    return appointment;
  }

  async update(id: string, updateDto: UpdateAppointmentDto, actor: UserContext): Promise<Appointment> {
    const appointment = await this.findOne(id);
    await this.validateReferences(updateDto);

    // Refresh the vehicle record (vehicle type / chassis) when those change (#6).
    const vehicleRecordId = await this.ensureVehicleRecord(
      updateDto.vehicle_record_id ?? appointment.vehicle_record_id ?? undefined,
      updateDto.plate_number ?? appointment.vehicleRecord?.plate_number,
      updateDto.vehicle_type,
      updateDto.chassis_no,
      actor,
    );

    // Update the linked customer's details (#4). Reuse the existing customer id.
    const customerId =
      updateDto.sync_customer !== false
        ? await this.ensureCustomer(
            { ...updateDto, customer_id: updateDto.customer_id ?? appointment.customer_id ?? undefined },
            vehicleRecordId,
            actor,
          )
        : (appointment.customer_id ?? undefined);

    // Only the appointment's own columns are merged — booking_type is left
    // untouched unless explicitly provided (#5: never silently flip Walk-in).
    const merged = this.appointmentDao.merge(appointment, {
      ...(updateDto.anpr_capture_id !== undefined ? { anpr_capture_id: updateDto.anpr_capture_id } : {}),
      ...(customerId !== undefined ? { customer_id: customerId } : {}),
      ...(vehicleRecordId !== undefined ? { vehicle_record_id: vehicleRecordId } : {}),
      ...(updateDto.centre_id !== undefined ? { centre_id: updateDto.centre_id } : {}),
      ...(updateDto.line_id !== undefined ? { line_id: updateDto.line_id } : {}),
      ...(updateDto.booking_type !== undefined ? { booking_type: updateDto.booking_type } : {}),
      ...(updateDto.status !== undefined ? { status: updateDto.status } : {}),
      ...(updateDto.notes !== undefined ? { notes: updateDto.notes } : {}),
      ...(updateDto.appointment_at ? { appointment_at: new Date(updateDto.appointment_at) } : {}),
    });

    const saved = await this.appointmentDao.save(merged);
    return (await this.appointmentDao.findActiveById(saved.id)) ?? saved;
  }

  async remove(id: string): Promise<void> {
    const appointment = await this.findOne(id);
    appointment.is_deleted = true;
    await this.appointmentDao.save(appointment);
  }

  /**
   * Ensure a vehicle record exists for the plate and reflects the latest vehicle
   * type / chassis (ANPR or operator entered). Returns the record id, or the
   * passed id / undefined when there is no plate to resolve.
   */
  private async ensureVehicleRecord(
    existingRecordId: string | null | undefined,
    plateNumber: string | undefined,
    vehicleType: string | undefined,
    chassisNo: string | undefined,
    actor: UserContext,
  ): Promise<string | undefined> {
    if (existingRecordId) {
      const record = await this.vehicleRecordDao.findActiveById(existingRecordId);
      if (record) {
        const merged = this.vehicleRecordDao.merge(record, {
          vehicle_type: vehicleType ?? record.vehicle_type,
          chassis_no: chassisNo ?? record.chassis_no,
        });
        const saved = await this.vehicleRecordDao.save(merged);
        return saved.id;
      }
    }

    const plate = plateNumber?.trim();
    if (!plate) return existingRecordId ?? undefined;

    const found = await this.vehicleRecordDao.findByPlateNumber(plate);
    if (found) {
      const merged = this.vehicleRecordDao.merge(found, {
        vehicle_type: vehicleType ?? found.vehicle_type,
        chassis_no: chassisNo ?? found.chassis_no,
      });
      const saved = await this.vehicleRecordDao.save(merged);
      return saved.id;
    }

    const created = await this.vehicleRecordDao.save(
      this.vehicleRecordDao.create({
        id: generateSnowflakeId(),
        vehicle_record_id: await this.vehicleRecordDao.getNextVehicleRecordId(),
        plate_number: plate,
        vehicle_type: vehicleType,
        chassis_no: chassisNo,
        created_by: getCreatedById(actor),
      }),
    );
    return created.id;
  }

  /**
   * Create or update the customer from the entered details and link it to the
   * vehicle record. Returns the customer id (always set so the appointment can
   * reference it).
   */
  private async ensureCustomer(
    dto: Partial<
      Pick<
        CreateAppointmentDto,
        'customer_id' | 'customer_name' | 'customer_phone' | 'id_number' | 'owner_name' | 'owner_phone' | 'driver_name' | 'driver_phone' | 'mulkiya_id' | 'chassis_no' | 'plate_number'
      >
    >,
    vehicleRecordId: string | undefined,
    actor: UserContext,
  ): Promise<string> {
    if (dto.customer_id) {
      const customer = await this.customerDao.findActiveById(dto.customer_id);
      if (!customer) {
        throw new ResourceNotFoundException('Customer', dto.customer_id);
      }
      const merged = this.customerDao.merge(customer, {
        owner_name: dto.owner_name ?? dto.customer_name ?? customer.owner_name,
        owner_phone_number: dto.owner_phone ?? dto.customer_phone ?? customer.owner_phone_number,
        driver_name: dto.driver_name ?? customer.driver_name,
        driver_phone_number: dto.driver_phone ?? customer.driver_phone_number,
        plate_number: dto.plate_number ?? customer.plate_number,
        // id_number is a system-generated code — backfill it if the row lacks one.
        id_number: customer.id_number ?? dto.id_number ?? generateIdNumber(),
        chassis_no: dto.chassis_no ?? customer.chassis_no,
        mulkiya_id: dto.mulkiya_id ?? customer.mulkiya_id,
        vehicle_record_id: vehicleRecordId ?? customer.vehicle_record_id,
      });
      const saved = await this.customerDao.save(merged);
      return saved.id;
    }

    if (!dto.customer_name || !dto.customer_phone) {
      throw new DatabaseException('Customer name and phone are required to create a customer.');
    }

    const customer = this.customerDao.create({
      id: generateSnowflakeId(),
      customer_id: await this.customerDao.getNextCustomerId(),
      // id_number is a system-generated nanoid-style code (not user entered).
      id_number: dto.id_number ?? generateIdNumber(),
      owner_name: dto.owner_name ?? dto.customer_name,
      owner_phone_number: dto.owner_phone ?? dto.customer_phone,
      // Driver defaults to the owner/customer when not provided.
      driver_name: dto.driver_name ?? dto.owner_name ?? dto.customer_name,
      driver_phone_number: dto.driver_phone,
      plate_number: dto.plate_number,
      chassis_no: dto.chassis_no,
      mulkiya_id: dto.mulkiya_id,
      vehicle_record_id: vehicleRecordId,
      created_by: getCreatedById(actor),
    });
    const saved = await this.customerDao.save(customer);
    return saved.id;
  }

  private async validateReferences(
    dto: Partial<
      Pick<CreateAppointmentDto, 'anpr_capture_id' | 'centre_id' | 'line_id' | 'customer_id' | 'payment_type_id'>
    >,
  ): Promise<void> {
    if (dto.anpr_capture_id) {
      const capture = await this.anprCaptureDao.findActiveById(dto.anpr_capture_id);
      if (!capture) {
        throw new ResourceNotFoundException('AnprCapture', dto.anpr_capture_id);
      }
    }
    if (dto.centre_id) {
      const centre = await this.centreDao.findActiveById(dto.centre_id);
      if (!centre) {
        throw new ResourceNotFoundException('Centre', dto.centre_id);
      }
    }
    if (dto.line_id) {
      const line = await this.lineDao.findActiveById(dto.line_id);
      if (!line) {
        throw new ResourceNotFoundException('Line', dto.line_id);
      }
    }
    if (dto.customer_id) {
      const customer = await this.customerDao.findActiveById(dto.customer_id);
      if (!customer) {
        throw new ResourceNotFoundException('Customer', dto.customer_id);
      }
    }
    if (dto.payment_type_id) {
      const paymentType = await this.paymentTypeDao.findActiveById(dto.payment_type_id);
      if (!paymentType) {
        throw new ResourceNotFoundException('PaymentType', dto.payment_type_id);
      }
    }
  }
}
