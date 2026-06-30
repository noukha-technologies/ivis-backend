import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  CreateAppointmentDto,
  UpdateAppointmentDto,
} from '../../common/dto/appointment.dto';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { ParseSnowflakeIdPipe } from '../../common/pipes/parse-snowflake-id.pipe';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { UserContext } from '../../common/dto/auth.dto';
import { AppointmentService } from './services/appointment.service';

@ApiTags('Appointments')
@Controller('appointments')
export class AppointmentController {
  constructor(private readonly appointmentService: AppointmentService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create appointment (syncs customer from ANPR/ROP when linked)' })
  async create(@CurrentUser() actor: UserContext, @Body() createDto: CreateAppointmentDto) {
    const data = await this.appointmentService.create(createDto, actor);
    return { message: 'Appointment created successfully', data };
  }

  @Get()
  @ApiOperation({ summary: 'List appointments (paginated)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  async findAll(@Query() query: PaginationQueryDto) {
    const result = await this.appointmentService.findAll(query);
    return { message: 'Appointments retrieved successfully', ...result };
  }

  @Get('plate-lookup')
  @ApiOperation({ summary: 'Resolve known vehicle/customer details by plate (walk-in auto-fill)' })
  @ApiQuery({ name: 'plate', required: true, type: String })
  async lookupByPlate(@Query('plate') plate: string) {
    const data = await this.appointmentService.resolveByPlate(plate);
    return { message: 'Plate lookup completed', data };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get appointment by ID' })
  @ApiParam({ name: 'id', type: String })
  async findOne(@Param('id', ParseSnowflakeIdPipe) id: string) {
    const data = await this.appointmentService.findOne(id);
    return { message: 'Appointment retrieved successfully', data };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update appointment' })
  async update(
    @CurrentUser() actor: UserContext,
    @Param('id', ParseSnowflakeIdPipe) id: string,
    @Body() updateDto: UpdateAppointmentDto,
  ) {
    const data = await this.appointmentService.update(id, updateDto, actor);
    return { message: 'Appointment updated successfully', data };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete appointment' })
  async remove(@Param('id', ParseSnowflakeIdPipe) id: string) {
    await this.appointmentService.remove(id);
    return { message: 'Appointment deleted successfully', data: null };
  }
}
