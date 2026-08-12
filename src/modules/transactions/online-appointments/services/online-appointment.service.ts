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
import { AppointmentBookingDao } from '../../../database/dao/appointment-booking.dao';
import { AppointmentIngestService } from './appointment-ingest.service';
import { OnlineAppointmentQueryDto } from '../../../../common/dto/online-appointment.dto';
import { PaginatedResult } from '../../../../common/interfaces/pagination.interface';

export interface OnlineAppointmentListResult {
  centre_id: string;
  centre_code: string;
  branch_code: string;
  date_from: string;
  date_to: string;
  appointments: AppointmentBooking[];
  total: number;
  meta: PaginatedResult<unknown>['meta'];
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
    private readonly bookingDao: AppointmentBookingDao,
    private readonly ingestService: AppointmentIngestService,
    private readonly logger: AppLogger,
  ) {}

  /**
   * One centre's bookings over a date range, read from the local mirror.
   *
   * Deliberately NOT a live call: the provider serves a single branch-day per
   * request, so a twelve-day range would cost twelve round trips and still
   * arrive unsearchable and unpaginated. The ingest already mirrors every
   * booking, so this is one indexed query — any span, searched and paged in
   * SQL — and the rows carry the provider's own status, which is what the
   * screen displays.
   */
  async findAll(
    centreId: string,
    query: OnlineAppointmentQueryDto,
  ): Promise<OnlineAppointmentListResult> {
    const centre = await this.requireLinkedCentre(centreId);

    const today = this.todayInOman();
    const dateFrom = query.date_from ?? query.date ?? today;
    const dateTo = query.date_to ?? query.date ?? dateFrom;

    const result = await this.bookingDao.findPaginatedForCentre(
      centre.id,
      dateFrom,
      dateTo,
      query,
    );

    return {
      centre_id: centre.id,
      centre_code: centre.code,
      branch_code: centre.provider_branch_code!,
      date_from: dateFrom,
      date_to: dateTo,
      // The stored payload IS the provider's response shape, so the client
      // keeps the same contract it had when this was a live pass-through.
      appointments: result.data.map(
        (booking) => booking.payload as unknown as AppointmentBooking,
      ),
      total: result.meta.total,
      meta: result.meta,
    };
  }

  /**
   * Pulls the provider now, outside the poll cycle — what the Refresh button
   * calls. Returns once the mirror is up to date, so the caller can re-read.
   */
  async refresh(centreId: string): Promise<void> {
    const centre = await this.requireLinkedCentre(centreId);
    await this.ingestService.refreshNow(centre);
  }

  private todayInOman(): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Muscat',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
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
