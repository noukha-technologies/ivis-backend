import { Module } from '@nestjs/common';
import { OnlineAppointmentController } from './online-appointment.controller';
import { OnlineAppointmentService } from './services/online-appointment.service';
import { AppointmentIngestService } from './services/appointment-ingest.service';

/**
 * The provider-facing appointment surface.
 *
 * Two distinct jobs live here:
 *   • OnlineAppointmentService — a live read-through for the Online
 *     Appointments screen; stores nothing.
 *   • AppointmentIngestService — the scheduled pull that mirrors bookings into
 *     `appointment_bookings` and promotes them to local appointments.
 *
 * DAOs come from the @Global DatabaseModule and the API client from the
 * @Global IntegrationsModule, so neither needs importing here.
 */
@Module({
  controllers: [OnlineAppointmentController],
  providers: [OnlineAppointmentService, AppointmentIngestService],
  exports: [OnlineAppointmentService, AppointmentIngestService],
})
export class OnlineAppointmentModule {}
