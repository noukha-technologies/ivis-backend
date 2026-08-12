import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AppLogger } from '../../../../common/logger/app.logger';
import { CentreDao } from '../../../database/dao/centre.dao';
import { Centre } from '../../../database/entity/centre.entity';
import { AppointmentApiClientService } from '../../../../common/integrations/appointments/appointment-api-client.service';
import { AppointmentBooking } from '../../../../common/integrations/appointments/appointment.types';

export interface OnlineAppointmentListResult {
  centre_id: string;
  centre_code: string;
  branch_code: string;
  date: string | null;
  appointments: AppointmentBooking[];
  total: number;
}

/**
 * Read-only view of the bookings held by the appointment provider for a
 * centre. Nothing here is stored locally — this is a live pass-through, so the
 * screen always shows what the provider currently holds rather than a stale
 * local copy.
 *
 * Authentication uses a single global server key, so a centre needs only its
 * branch code to identify whose bookings to read. A centre that is not linked
 * yet is a configuration state rather than an error — it surfaces as a 400
 * telling the operator to link the centre, not as an empty list that would
 * look like "no bookings today".
 */
@Injectable()
export class OnlineAppointmentService {
  private static readonly context = 'OnlineAppointmentService';

  constructor(
    private readonly centreDao: CentreDao,
    private readonly appointmentApi: AppointmentApiClientService,
    private readonly logger: AppLogger,
  ) {}

  /** One centre's bookings for one day, as the provider currently holds them. */
  async findAll(
    centreId: string,
    date?: string,
  ): Promise<OnlineAppointmentListResult> {
    const centre = await this.requireLinkedCentre(centreId);

    const appointments = await this.appointmentApi.fetchAppointments(
      centre.provider_branch_code!,
      date,
    );

    if (!appointments) {
      this.logger.warn(
        `Appointment provider returned no result for centre ${centre.code}${date ? ` on ${date}` : ''}`,
        OnlineAppointmentService.context,
      );
    }

    return {
      centre_id: centre.id,
      centre_code: centre.code,
      branch_code: centre.provider_branch_code!,
      date: date ?? null,
      appointments: appointments ?? [],
      total: appointments?.length ?? 0,
    };
  }

  /**
   * One booking by the provider's booking number.
   *
   * Booking numbers are globally unique, so this needs no branch code — and
   * therefore no linked centre. Requiring a link here would block a legitimate
   * lookup for a booking that exists, purely because of local configuration.
   */
  async findByBookingId(bookingId: string): Promise<AppointmentBooking> {
    const booking = await this.appointmentApi.fetchByBookingId(bookingId);

    if (!booking) {
      throw new NotFoundException(`No booking found for ${bookingId}`);
    }

    return booking;
  }

  /**
   * The lane lookup: the vehicle currently at the lane for this plate. Matches
   * only CHECKED_IN or IN_PROGRESS on the given day, so a vehicle that has not
   * arrived — or has already finished — is correctly absent. Null is the normal
   * answer for a walk-in with no booking, so this returns null rather than
   * throwing, letting the caller decide what that means.
   */
  async findByPlate(
    centreId: string,
    plateNumber: string,
    plateType = 'PRIVATE',
    date?: string,
  ): Promise<AppointmentBooking | null> {
    const centre = await this.requireLinkedCentre(centreId);

    return this.appointmentApi.fetchByPlate(
      centre.provider_branch_code!,
      plateType,
      plateNumber,
      date,
    );
  }

  /**
   * A centre linked to a provider branch. Authentication uses the global
   * server key, so all a centre needs is the branch code identifying which
   * branch's bookings to read.
   */
  private async requireLinkedCentre(centreId: string): Promise<Centre> {
    const centre = await this.centreDao.findActiveById(centreId);
    if (!centre) {
      throw new NotFoundException(`Centre ${centreId} not found`);
    }

    if (!centre.provider_branch_code?.trim()) {
      throw new BadRequestException(
        `Centre ${centre.code} is not linked to an appointment branch. Link it first via POST /masters/centres/${centre.id}/link-branch.`,
      );
    }

    return centre;
  }
}
