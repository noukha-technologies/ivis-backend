import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../common/interfaces/pagination.interface';
import {
  buildTypeOrmPaginationOptions,
  toPaginatedResult,
} from '../../../common/shared/pagination/pagination-query.util';
import { PaginationService } from '../../../common/shared/pagination/pagination.service';
import { IAppointmentDao } from '../../appointments/dao/appointment.dao.interface';
import { Appointment } from '../entity/appointment.entity';
import { AppointmentStatus } from '../../../common/enums/common.enums';

@Injectable()
export class AppointmentDao
  extends Repository<Appointment>
  implements IAppointmentDao
{
  private static readonly detailRelations = {
    anprCapture: true,
    // Loaded because converting to a job requires a Fetched ROP verification —
    // see JobService.createFromAppointment.
    ropVerification: true,
    customer: { vehicleRecord: true },
    vehicleRecord: { vehicleMaster: true },
    centre: true,
    line: true,
  } as const;

  constructor(
    private readonly dataSource: DataSource,
    private readonly paginationService: PaginationService,
  ) {
    super(Appointment, dataSource.createEntityManager());
  }

  async findActiveById(id: string): Promise<Appointment | null> {
    return this.findOne({
      where: { id, is_deleted: false },
      relations: AppointmentDao.detailRelations,
    });
  }

  async findByAnprCaptureId(
    anprCaptureId: string,
  ): Promise<Appointment | null> {
    return this.findOne({
      where: { anpr_capture_id: anprCaptureId, is_deleted: false },
    });
  }

  async findByAppointmentId(
    appointmentId: number,
  ): Promise<Appointment | null> {
    return this.findOne({
      where: { appointment_id: appointmentId, is_deleted: false },
      relations: AppointmentDao.detailRelations,
    });
  }

  async findPaginated(
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<Appointment>> {
    const qb = this.createQueryBuilder('appointment')
      .leftJoinAndSelect('appointment.customer', 'customer')
      .leftJoinAndSelect('appointment.vehicleRecord', 'vehicleRecord')
      .leftJoinAndSelect('vehicleRecord.vehicleMaster', 'vehicleMaster')
      .leftJoinAndSelect('appointment.anprCapture', 'anprCapture')
      // The list needs this so the UI can show why an appointment is not yet
      // convertible, rather than letting the operator reach the final step and
      // be refused there.
      .leftJoinAndSelect('appointment.ropVerification', 'ropVerification')
      .leftJoinAndSelect('appointment.centre', 'centre')
      .leftJoinAndSelect('appointment.line', 'line');

    const options = buildTypeOrmPaginationOptions<Appointment, Appointment>(
      query,
      {
        searchFields: [
          'status',
          'customer.owner_name',
          'customer.owner_phone_number',
          'vehicleRecord.plate_number',
          'anprCapture.plate_number',
        ],
        allowedSortFields: [
          'appointment_id',
          'status',
          'appointment_at',
          'created_at',
          'updated_at',
        ],
        defaultSort: { appointment_at: 'DESC' },
        baseWhere: { is_deleted: false },
      },
    );

    const response = await this.paginationService.paginateQueryBuilder(
      qb,
      'appointment',
      options,
    );
    return toPaginatedResult(response);
  }

  /**
   * A queued appointment for this plate at this centre that no vehicle has
   * arrived against yet — i.e. an ingested online booking waiting for its car.
   *
   * Deliberately does NOT join vehicleRecord (unlike findLatestQueuedByPlate):
   * a booking ingested before arrival has no vehicle record, so joining would
   * exclude exactly the rows this is meant to find. It matches on the plate
   * carried directly on the appointment instead.
   */
  async findQueuedOnlineByPlate(
    plate: string,
    centreId: string | null,
  ): Promise<Appointment | null> {
    const qb = this.createQueryBuilder('appointment')
      .where('appointment.is_deleted = false')
      .andWhere('appointment.status = :status', {
        status: AppointmentStatus.QUEUED,
      })
      .andWhere('appointment.anpr_capture_id IS NULL')
      .andWhere('UPPER(appointment.plate_number) = UPPER(:plate)', { plate });

    if (centreId) {
      qb.andWhere('appointment.centre_id = :centreId', { centreId });
    }

    return qb.orderBy('appointment.appointment_at', 'ASC').getOne();
  }

  findByProviderBookingId(bookingId: string): Promise<Appointment | null> {
    return this.findOne({
      where: { provider_booking_id: bookingId, is_deleted: false },
    });
  }

  async findLatestQueuedByPlate(plate: string): Promise<Appointment | null> {
    return this.createQueryBuilder('appointment')
      .innerJoin('appointment.vehicleRecord', 'vehicleRecord')
      .where('appointment.is_deleted = false')
      .andWhere('appointment.status = :status', {
        status: AppointmentStatus.QUEUED,
      })
      .andWhere('appointment.anpr_capture_id IS NULL')
      .andWhere('vehicleRecord.plate_number = :plate', { plate })
      .orderBy('appointment.created_at', 'DESC')
      .getOne();
  }

  /**
   * Any still-open appointment for this plate, regardless of how the plate is
   * carried on the row.
   *
   * "Open" means the vehicle's visit has not reached an end state: CONVERTED
   * (a job was created from it — the appointment's job is done) and CANCELLED
   * are terminal, everything else (QUEUED, SCHEDULED) is still live. Stated as
   * NOT IN (terminal) rather than IN (open) on purpose: a status added later
   * blocks by default, which fails safe.
   *
   * The plate is matched against BOTH sources because neither alone is
   * complete — walk-ins created via AppointmentService.create() leave
   * appointment.plate_number null and only carry the plate on the linked
   * vehicle record, while bookings ingested before the car arrives have the
   * plate on the appointment and no vehicle record yet. leftJoin (not inner)
   * so plate-on-appointment rows are not dropped for want of a vehicle record.
   */
  async findOpenByPlate(
    plate: string,
    excludeAppointmentRowId?: string,
  ): Promise<Appointment | null> {
    const qb = this.createQueryBuilder('appointment')
      .leftJoin('appointment.vehicleRecord', 'vehicleRecord')
      .where('appointment.is_deleted = false')
      .andWhere('appointment.status NOT IN (:...terminal)', {
        terminal: [AppointmentStatus.CONVERTED, AppointmentStatus.CANCELLED],
      })
      .andWhere(
        '(UPPER(appointment.plate_number) = UPPER(:plate) OR UPPER(vehicleRecord.plate_number) = UPPER(:plate))',
        { plate },
      );

    // Lets an update re-validate itself without matching its own row.
    if (excludeAppointmentRowId) {
      qb.andWhere('appointment.id != :excludeId', {
        excludeId: excludeAppointmentRowId,
      });
    }

    return qb.orderBy('appointment.created_at', 'DESC').getOne();
  }

  async getNextAppointmentId(): Promise<number> {
    const result = await this.createQueryBuilder('appointment')
      .select('MAX(appointment.appointment_id)', 'max')
      .getRawOne();
    const max = result?.max ? Number(result.max) : 0;
    return max + 1;
  }
}
