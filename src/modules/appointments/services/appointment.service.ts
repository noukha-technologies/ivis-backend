import { Injectable } from '@nestjs/common';
import {
  CreateAppointmentDto,
  UpdateAppointmentDto,
} from '../../../common/dto/appointment.dto';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../common/interfaces/pagination.interface';
import {
  DatabaseException,
  DuplicateResourceException,
  ResourceNotFoundException,
} from '../../../common/exceptions/custom.exception';
import { AppLogger } from '../../../common/logger/app.logger';
import type { UserContext } from '../../../common/dto/auth.dto';
import { getCreatedById } from '../../../common/utils/created-by.util';
import { generateSnowflakeId } from '../../../common/shared/snowflakeIdGeneration';
import { AnprCaptureDao } from '../../database/dao/anpr-capture.dao';
import { AppointmentDao } from '../../database/dao/appointment.dao';
import { CentreDao } from '../../database/dao/centre.dao';
import { CustomerDao } from '../../database/dao/customer.dao';
import { LineDao } from '../../database/dao/line.dao';
import { PaymentDao } from '../../database/dao/payment.dao';
import { Appointment } from '../../database/entity/appointment.entity';
import { VehicleIntakeService } from '../../transactions/shared/vehicle-intake.service';

@Injectable()
export class AppointmentService {
  private static readonly context = 'AppointmentService';

  constructor(
    private readonly appointmentDao: AppointmentDao,
    private readonly customerDao: CustomerDao,
    private readonly anprCaptureDao: AnprCaptureDao,
    private readonly centreDao: CentreDao,
    private readonly lineDao: LineDao,
    private readonly paymentDao: PaymentDao,
    private readonly vehicleIntakeService: VehicleIntakeService,
    private readonly logger: AppLogger,
  ) { }

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
        appointment_at: new Date(createDto.appointment_at),
        status: createDto.status || 'Scheduled',
        notes: createDto.notes,
        payment_mode: createDto.payment_mode,
        type: createDto.type,
        created_by: getCreatedById(actor),
      });

      const saved = await this.appointmentDao.save(appointment);
      this.logger.log(`Appointment created ID: ${saved.id}`, AppointmentService.context);

      if (saved.customer_id) {
        try {
          const paymentId = await this.paymentDao.getNextId();
          const code = `PM-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

          const paymentRecord = this.paymentDao.create({
            id: generateSnowflakeId(),
            payment_id: paymentId,
            customer_id: saved.customer_id,
            code,
            status: 'Active',
            payment_mode: saved.payment_mode,
            type: saved.type,
            amount: createDto.amount,
            created_by: getCreatedById(actor),
          });
          await this.paymentDao.save(paymentRecord);
          this.logger.log(`Auto-created payment record for appointment: ${saved.id}`, AppointmentService.context);
        } catch (payError) {
          this.logger.error(
            `Failed to auto-create payment record for appointment: ${(payError as Error).message}`,
            (payError as Error).stack,
            AppointmentService.context,
          );
        }
      }

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
      const rop = await this.vehicleIntakeService.findLatestRopByCaptureId(dto.anpr_capture_id);
      const capture = await this.anprCaptureDao.findActiveById(dto.anpr_capture_id);
      if (rop && capture) {
        const record = await this.vehicleIntakeService.upsertVehicleRecordFromRop(rop, capture, actor);
        vehicleRecordId = record.id;
      }
    }

    if (dto.customer_id) {
      const customer = await this.customerDao.findActiveById(dto.customer_id);
      if (!customer) {
        throw new ResourceNotFoundException('Customer', dto.customer_id);
      }

      const merged = this.customerDao.merge(customer, {
        name: dto.customer_name,
        phone: dto.customer_phone,
        id_number: dto.id_number,
        chassis_no: dto.chassis_no,
        mulkiya_id: dto.mulkiya_id,
        owner_name: dto.customer_name,
        primary_vehicle_record_id: vehicleRecordId ?? customer.primary_vehicle_record_id,
      });
      const saved = await this.customerDao.save(merged);
      return { customerId: saved.id, vehicleRecordId: saved.primary_vehicle_record_id ?? undefined };
    }

    if (!plateNumber) {
      throw new DatabaseException('Plate number is required to create a customer for appointment.');
    }

    const customerId = await this.customerDao.getNextCustomerId();
    const customer = this.customerDao.create({
      id: generateSnowflakeId(),
      customer_id: customerId,
      name: dto.customer_name,
      phone: dto.customer_phone,
      owner_name: dto.customer_name,
      id_number: dto.id_number,
      chassis_no: dto.chassis_no,
      mulkiya_id: dto.mulkiya_id,
      primary_vehicle_record_id: vehicleRecordId,
      created_by: getCreatedById(actor),
    });
    const saved = await this.customerDao.save(customer);
    return { customerId: saved.id, vehicleRecordId };
  }

  private async validateReferences(
    dto: Partial<
      Pick<CreateAppointmentDto, 'anpr_capture_id' | 'centre_id' | 'line_id' | 'customer_id'>
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
  }
}
