import { AppointmentBooking } from '../../../database/entity/appointment-booking.entity';

export interface IAppointmentBookingDao {
  findByBookingId(bookingId: string): Promise<AppointmentBooking | null>;
  findByBookingIds(bookingIds: string[]): Promise<AppointmentBooking[]>;
  findByCentreAndDate(
    centreId: string,
    bookingDate: string,
  ): Promise<AppointmentBooking[]>;
  findPendingPromotion(centreId: string): Promise<AppointmentBooking[]>;
  markWithdrawn(ids: string[]): Promise<void>;
}
