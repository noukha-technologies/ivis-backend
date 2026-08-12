import { Injectable } from '@nestjs/common';
import { Brackets, DataSource, In, Repository } from 'typeorm';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../common/interfaces/pagination.interface';
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

  /**
   * One centre's bookings over a DATE RANGE, searched and paginated in SQL.
   *
   * The provider serves a single day per call, so a range against it costs one
   * request per day. Everything it returns is already mirrored here, so the
   * screen reads this instead: one query, any span, with search and paging done
   * by the database rather than in the browser.
   */
  async findPaginatedForCentre(
    centreId: string,
    dateFrom: string,
    dateTo: string,
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<AppointmentBooking>> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));

    const qb = this.createQueryBuilder('booking')
      .where('booking.centre_id = :centreId', { centreId })
      .andWhere('booking.booking_date BETWEEN :dateFrom AND :dateTo', {
        dateFrom,
        dateTo,
      });

    const search = query.search?.trim();
    if (search) {
      // Every column the screen displays is searchable. The payload fields
      // (vehicle make/model, customer name/phone) live in jsonb, so they are
      // matched with ->> rather than being duplicated into columns.
      qb.andWhere(
        new Brackets((w) => {
          w.where('booking.booking_id ILIKE :term')
            .orWhere('booking.plate_number ILIKE :term')
            .orWhere('booking.plate_type ILIKE :term')
            .orWhere('booking.provider_status ILIKE :term')
            .orWhere("booking.payload->'vehicle'->>'make' ILIKE :term")
            .orWhere("booking.payload->'vehicle'->>'model' ILIKE :term")
            .orWhere("booking.payload->'vehicle'->>'category' ILIKE :term")
            .orWhere("booking.payload->'customer'->>'name' ILIKE :term")
            .orWhere("booking.payload->'customer'->>'phone' ILIKE :term")
            .orWhere("booking.payload->>'assigned_lane' ILIKE :term")
            .orWhere("booking.payload->>'fee_amount' ILIKE :term");
        }),
        { term: `%${search}%` },
      );
    }

    const sortable: Record<string, string> = {
      booking_id: 'booking.booking_id',
      booking_date: 'booking.booking_date',
      plate_number: 'booking.plate_number',
      plate_type: 'booking.plate_type',
      provider_status: 'booking.provider_status',
    };
    const sortBy = sortable[query.sortBy ?? ''] ?? 'booking.booking_date';
    const sortOrder = query.sortOrder === 'ASC' ? 'ASC' : 'DESC';

    qb.orderBy(sortBy, sortOrder)
      .addOrderBy('booking.booking_time', sortOrder)
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        hasNextPage: page * limit < total,
        hasPreviousPage: page > 1,
      },
    };
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
