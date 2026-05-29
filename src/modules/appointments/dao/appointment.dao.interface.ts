import { DeepPartial } from 'typeorm';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../common/interfaces/pagination.interface';
import { Appointment } from '../../database/entity/appointment.entity';

export interface IAppointmentDao {
  create(entityLike: DeepPartial<Appointment>): Appointment;
  save(entity: Appointment): Promise<Appointment>;
  merge(entity: Appointment, entityLike: DeepPartial<Appointment>): Appointment;
  findActiveById(id: string): Promise<Appointment | null>;
  findByAppointmentId(appointmentId: number): Promise<Appointment | null>;
  findPaginated(query: PaginationQueryDto): Promise<PaginatedResult<Appointment>>;
  getNextAppointmentId(): Promise<number>;
}
