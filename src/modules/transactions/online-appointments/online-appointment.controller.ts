import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ParseSnowflakeIdPipe } from '../../../common/pipes/parse-snowflake-id.pipe';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { PermissionKeys } from '../../../common/constants/permissions';
import {
  OnlineAppointmentPlateQueryDto,
  OnlineAppointmentQueryDto,
} from '../../../common/dto/online-appointment.dto';
import { OnlineAppointmentService } from './services/online-appointment.service';

/**
 * Read-only view of the appointment provider's bookings for a centre.
 *
 * The list is served from the local mirror the ingest maintains — the provider
 * has no range endpoint, so reading it live cost one request per day and could
 * not be searched or paged. The single-booking and by-plate lookups stay live,
 * since those are point queries where freshness matters most.
 */
@ApiTags('Transactions / Online Appointments')
@Controller('transactions/online-appointments')
export class OnlineAppointmentController {
  constructor(
    private readonly onlineAppointmentService: OnlineAppointmentService,
  ) {}

  @Get('centres/:centreId')
  @Permissions(PermissionKeys.APPOINTMENTS_VIEW)
  @ApiOperation({
    summary: "One centre's online bookings over a date range",
    description:
      "Served from the local mirror the ingest keeps up to date, so any span is a single query with search, sort and pagination done in SQL. Rows carry the provider's own status. Use POST refresh to pull from the provider on demand.",
  })
  @ApiParam({ name: 'centreId', description: 'Centre snowflake id' })
  @ApiQuery({
    name: 'date',
    required: false,
    type: String,
    description: 'YYYY-MM-DD in Oman local time. Defaults to today.',
  })
  @ApiResponse({ status: 200, description: 'Bookings retrieved.' })
  @ApiResponse({
    status: 400,
    description: 'Centre is not linked to an appointment branch.',
  })
  @ApiResponse({ status: 404, description: 'Centre not found.' })
  async findAll(
    @Param('centreId', ParseSnowflakeIdPipe) centreId: string,
    @Query() query: OnlineAppointmentQueryDto,
  ) {
    const data = await this.onlineAppointmentService.findAll(centreId, query);
    return { message: 'Online appointments retrieved successfully', data };
  }

  @Post('centres/:centreId/refresh')
  @HttpCode(HttpStatus.OK)
  @Permissions(PermissionKeys.APPOINTMENTS_VIEW)
  @ApiOperation({
    summary: 'Pull this centre from the provider now',
    description:
      'Runs the ingest immediately for the whole forward window instead of waiting for the poll, then returns. Backs the Refresh button — the list is served from the mirror, so it must be brought up to date first.',
  })
  @ApiParam({ name: 'centreId', description: 'Centre snowflake id' })
  @ApiResponse({ status: 200, description: 'Mirror refreshed.' })
  @ApiResponse({
    status: 400,
    description: 'Centre is not linked to an appointment branch.',
  })
  async refresh(@Param('centreId', ParseSnowflakeIdPipe) centreId: string) {
    await this.onlineAppointmentService.refresh(centreId);
    return {
      message: 'Online appointments refreshed successfully',
      data: null,
    };
  }

  @Get('centres/:centreId/by-plate/:plateNumber')
  @Permissions(PermissionKeys.APPOINTMENTS_VIEW)
  @ApiOperation({
    summary: 'The vehicle currently at the lane for this plate',
    description:
      'Matches only CHECKED_IN or IN_PROGRESS bookings on the given day, so a vehicle that has not arrived — or has already finished — is absent. A null result is the normal answer for a walk-in with no booking.',
  })
  @ApiParam({ name: 'centreId', description: 'Centre snowflake id' })
  @ApiParam({
    name: 'plateNumber',
    description:
      'Oman plate: 1-5 digits then 1-3 letters (e.g. 1234AB). Spaces and hyphens are normalized away by the provider.',
  })
  @ApiQuery({
    name: 'plate_type',
    required: false,
    description: 'Defaults to PRIVATE.',
  })
  @ApiQuery({ name: 'date', required: false, type: String })
  @ApiResponse({
    status: 200,
    description: 'Booking found, or null when the plate has none.',
  })
  @ApiResponse({
    status: 400,
    description: 'Centre is not linked to an appointment branch.',
  })
  async findByPlate(
    @Param('centreId', ParseSnowflakeIdPipe) centreId: string,
    @Param('plateNumber') plateNumber: string,
    @Query() query: OnlineAppointmentPlateQueryDto,
  ) {
    const data = await this.onlineAppointmentService.findByPlate(
      centreId,
      plateNumber,
      query.plate_type ?? 'PRIVATE',
      query.date,
    );
    return {
      message: data
        ? 'Online appointment retrieved successfully'
        : 'No online appointment at the lane for this plate',
      data,
    };
  }

  @Get('bookings/:bookingId/events')
  @Permissions(PermissionKeys.APPOINTMENTS_VIEW)
  @ApiOperation({
    summary: 'Events IVIS has pushed to the provider for this booking',
    description:
      'Newest first. Each row carries both verdicts — delivery status (did it reach them) and event status (did their worker apply it) — plus the payload we sent and the raw bodies they answered with. An empty list is normal: a booking whose vehicle has not arrived has raised no events. The centre-wide lane heartbeat belongs to no single booking and is not listed.',
  })
  @ApiParam({
    name: 'bookingId',
    description: 'Provider booking number, e.g. TJ-SBX-B6D727C6',
  })
  @ApiResponse({ status: 200, description: 'Events retrieved.' })
  async findEvents(@Param('bookingId') bookingId: string) {
    const data =
      await this.onlineAppointmentService.findEventsForBooking(bookingId);
    return { message: 'Provider events retrieved successfully', data };
  }

  @Get('bookings/:bookingId')
  @Permissions(PermissionKeys.APPOINTMENTS_VIEW)
  @ApiOperation({
    summary: "One booking by the provider's booking number",
    description:
      'Booking numbers are globally unique, so this takes no centre or branch code.',
  })
  @ApiParam({
    name: 'bookingId',
    description: 'Provider booking number, e.g. TJ-SBX-B6D727C6',
  })
  @ApiResponse({ status: 200, description: 'Booking retrieved.' })
  @ApiResponse({ status: 404, description: 'Booking not found.' })
  async findByBookingId(@Param('bookingId') bookingId: string) {
    const data = await this.onlineAppointmentService.findByBookingId(bookingId);
    return { message: 'Online appointment retrieved successfully', data };
  }
}
