import { Controller, Get, Param, Query } from '@nestjs/common';
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
 * Live read-only view of the appointment provider's bookings for a centre.
 * Nothing is persisted locally — each call passes through to the provider, so
 * the screen shows current state rather than a stale copy.
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
    summary: "One centre's online bookings for a day",
    description:
      'Live pass-through to the provider, ordered by appointment time. Includes CONFIRMED, CHECKED_IN, IN_PROGRESS and COMPLETED. An empty day is a healthy result with total 0.',
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
    const data = await this.onlineAppointmentService.findAll(
      centreId,
      query.date,
    );
    return { message: 'Online appointments retrieved successfully', data };
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
