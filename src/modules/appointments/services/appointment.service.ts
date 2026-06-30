import { Injectable } from '@nestjs/common';

import type { UserContext } from '../../../common/dto/auth.dto';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { CreateAppointmentDto, UpdateAppointmentDto } from '../../../common/dto/appointment.dto';

import { AppLogger } from '../../../common/logger/app.logger';
import { getCreatedById } from '../../../common/utils/created-by.util';
import { generateSnowflakeId } from '../../../common/shared/snowflakeIdGeneration';
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

    return {
      plate_number: record.plate_number,
      owner_name: customer?.owner_name ?? customer?.customer_name ?? null,
      customer_name: customer?.customer_name ?? null,
      customer_phone: customer?.phone ?? null,
      id_number: customer?.id_number ?? customer?.mulkiya_id ?? null,
      plate_color: record.plate_color ?? null,
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

      let customerId = createDto.customer_id;
      let vehicleRecordId = createDto.vehicle_record_id;
      let plateNumber = createDto.plate_number;

      if (createDto.anpr_capture_id) {
        const capture = await this.anprCaptureDao.findActiveById(createDto.anpr_capture_id);
        if (!capture) {
          throw new ResourceNotFoundException('AnprCapture', createDto.anpr_capture_id);
        }
        plateNumber = plateNumber || capture.plate_number;
      }

      if (createDto.sync_customer !== false) {
        const synced = await this.syncCustomerFromAppointment(createDto, plateNumber, actor);
        customerId = synced.customerId;
        vehicleRecordId = synced.vehicleRecordId;
      }

      const appointment = this.appointmentDao.create({
        id: generateSnowflakeId(),
        appointment_id: appointmentId,
        anpr_capture_id: createDto.anpr_capture_id,
        customer_id: customerId,
        vehicle_record_id: vehicleRecordId,
        centre_id: createDto.centre_id,
        line_id: createDto.line_id,
        plate_number: plateNumber,
        customer_name: createDto.customer_name,
        customer_phone: createDto.customer_phone,
        id_number: createDto.id_number,
        owner_name: createDto.owner_name,
        plate_color: createDto.plate_color,
        appointment_at: new Date(createDto.appointment_at),
        status: AppointmentStatus.QUEUED,
        notes: createDto.notes,
        payment_type_id: createDto.payment_type_id,
        type: createDto.type,
        booking_type: createDto.booking_type ?? BookingType.WALK_IN,
        vehicle_type: createDto.vehicle_type,
        charge_category_id: createDto.charge_category_id,
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

    if (updateDto.sync_customer !== false && (updateDto.customer_name || updateDto.customer_id)) {
      await this.syncCustomerFromAppointment(
        {
          ...updateDto,
          customer_id: updateDto.customer_id ?? appointment.customer_id ?? undefined,
          anpr_capture_id: updateDto.anpr_capture_id ?? appointment.anpr_capture_id ?? undefined,
          customer_name: updateDto.customer_name ?? appointment.customer_name ?? '',
          customer_phone: updateDto.customer_phone ?? appointment.customer_phone ?? '',
          id_number: updateDto.id_number ?? appointment.id_number,
          chassis_no: updateDto.chassis_no,
          mulkiya_id: updateDto.mulkiya_id,
        },
        updateDto.plate_number ?? appointment.plate_number,
        actor,
      );
    }

    const merged = this.appointmentDao.merge(appointment, {
      ...updateDto,
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

  private async syncCustomerFromAppointment(
    dto: Pick<
      CreateAppointmentDto,
      | 'customer_id'
      | 'anpr_capture_id'
      | 'customer_name'
      | 'customer_phone'
      | 'id_number'
      | 'mulkiya_id'
      | 'vehicle_record_id'
    > & {
      chassis_no?: string;
    },
    plateNumber: string | undefined,
    actor: UserContext,
  ): Promise<{ customerId: string; vehicleRecordId?: string }> {
    let vehicleRecordId = dto.vehicle_record_id;

    if (dto.anpr_capture_id) {
      // const rop = await this.vehicleIntakeService.findLatestRopByCaptureId(dto.anpr_capture_id);
      // const capture = await this.anprCaptureDao.findActiveById(dto.anpr_capture_id);
      // if (rop && capture) {
      //   const record = await this.vehicleIntakeService.upsertVehicleRecordFromRop(rop, capture, actor);
      //   vehicleRecordId = record.id;
      // }
    }

    if (dto.customer_id) {
      const customer = await this.customerDao.findActiveById(dto.customer_id);
      if (!customer) {
        throw new ResourceNotFoundException('Customer', dto.customer_id);
      }

      const merged = this.customerDao.merge(customer, {
        customer_name: dto.customer_name,
        phone: dto.customer_phone,
        id_number: dto.id_number,
        chassis_no: dto.chassis_no,
        mulkiya_id: dto.mulkiya_id,
        owner_name: dto.customer_name,
        vehicle_record_id: vehicleRecordId ?? customer.vehicle_record_id,
      });
      const saved = await this.customerDao.save(merged);
      return { customerId: saved.id, vehicleRecordId: saved.vehicle_record_id ?? undefined };
    }

    if (!plateNumber) {
      throw new DatabaseException('Plate number is required to create a customer for appointment.');
    }

    const customerId = await this.customerDao.getNextCustomerId();
    const customer = this.customerDao.create({
      id: generateSnowflakeId(),
      customer_id: customerId,
      customer_name: dto.customer_name,
      phone: dto.customer_phone,
      owner_name: dto.customer_name,
      id_number: dto.id_number,
      chassis_no: dto.chassis_no,
      mulkiya_id: dto.mulkiya_id,
      vehicle_record_id: vehicleRecordId,
      created_by: getCreatedById(actor),
    });
    const saved = await this.customerDao.save(customer);
    return { customerId: saved.id, vehicleRecordId };
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
