import { Injectable } from '@nestjs/common';
import { DataSource, In, Repository } from 'typeorm';
import { AppointmentBooking } from '../entity/appointment-booking.entity';
import { IAppointmentBookingDao } from '../../transactions/online-appointments/dao/appointment-booking.dao.interface';

@Injectable()
export class AppointmentBookingDao
  extends Repository<AppointmentBooking>
  implements IAppointmentBookingDao
{
  constructor(private readonly dataSource: DataSource) {
    super(AppointmentBooking, dataSource.createEntityManager());
  }

  findByBookingId(bookingId: string): Promise<AppointmentBooking | null> {
    return this.findOne({ where: { booking_id: bookingId } });
  }

  findByBookingIds(bookingIds: string[]): Promise<AppointmentBooking[]> {
    if (bookingIds.length === 0) return Promise.resolve([]);
    return this.find({ where: { booking_id: In(bookingIds) } });
  }

  /** Every booking held for one centre-day, withdrawn ones included. */
  findByCentreAndDate(
    centreId: string,
    bookingDate: string,
  ): Promise<AppointmentBooking[]> {
    return this.find({
      where: { centre_id: centreId, booking_date: bookingDate },
    });
  }

  /**
   * Bookings ingested but not yet promoted to a local appointment. The poller
   * retries these, so a promotion that failed mid-cycle is picked up next time
   * rather than being lost.
   */
  findPendingPromotion(centreId: string): Promise<AppointmentBooking[]> {
    return this.createQueryBuilder('booking')
      .where('booking.centre_id = :centreId', { centreId })
      .andWhere('booking.appointment_id IS NULL')
      .andWhere('booking.is_withdrawn = false')
      .orderBy('booking.booking_date', 'ASC')
      .addOrderBy('booking.booking_time', 'ASC')
      .getMany();
  }

  /**
   * Marks bookings that no longer appear in the provider's day — typically a
   * cancellation. Not a delete: downstream work may already reference them.
   */
  async markWithdrawn(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.createQueryBuilder()
      .update(AppointmentBooking)
      .set({ is_withdrawn: true })
      .whereInIds(ids)
      .execute();
  }
}
