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

@Injectable()
export class AppointmentDao extends Repository<Appointment> implements IAppointmentDao {
  private static readonly detailRelations = {
    anprCapture: true,
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

  async findByAnprCaptureId(anprCaptureId: string): Promise<Appointment | null> {
    return this.findOne({
      where: { anpr_capture_id: anprCaptureId, is_deleted: false },
    });
  }

  async findByAppointmentId(appointmentId: number): Promise<Appointment | null> {
    return this.findOne({
      where: { appointment_id: appointmentId, is_deleted: false },
      relations: AppointmentDao.detailRelations,
    });
  }

  async findPaginated(query: PaginationQueryDto): Promise<PaginatedResult<Appointment>> {
    const qb = this.createQueryBuilder('appointment')
      .leftJoinAndSelect('appointment.customer', 'customer')
      .leftJoinAndSelect('appointment.vehicleRecord', 'vehicleRecord')
      .leftJoinAndSelect('vehicleRecord.vehicleMaster', 'vehicleMaster')
      .leftJoinAndSelect('appointment.anprCapture', 'anprCapture')
      .leftJoinAndSelect('appointment.centre', 'centre')
      .leftJoinAndSelect('appointment.line', 'line');

    const options = buildTypeOrmPaginationOptions<Appointment, Appointment>(query, {
      searchFields: [
        'status',
        'customer.customer_name',
        'customer.customer_phone_number',
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
    });

    const response = await this.paginationService.paginateQueryBuilder(qb, 'appointment', options);
    return toPaginatedResult(response);
  }

  async getNextAppointmentId(): Promise<number> {
    const result = await this.createQueryBuilder('appointment')
      .select('MAX(appointment.appointment_id)', 'max')
      .getRawOne();
    const max = result?.max ? Number(result.max) : 0;
    return max + 1;
  }
}
