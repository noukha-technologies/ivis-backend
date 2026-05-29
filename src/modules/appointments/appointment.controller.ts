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
import { AppointmentService } from './services/appointment.service';

@ApiTags('Appointments')
@Controller('appointments')
export class AppointmentController {
  constructor(private readonly appointmentService: AppointmentService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create appointment (syncs customer from ANPR/ROP when linked)' })
  async create(@Body() createDto: CreateAppointmentDto) {
    const data = await this.appointmentService.create(createDto);
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
    @Param('id', ParseSnowflakeIdPipe) id: string,
    @Body() updateDto: UpdateAppointmentDto,
  ) {
    const data = await this.appointmentService.update(id, updateDto);
    return { message: 'Appointment updated successfully', data };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete appointment' })
  async remove(@Param('id', ParseSnowflakeIdPipe) id: string) {
    await this.appointmentService.remove(id);
    return { message: 'Appointment deleted successfully', data: null };
  }
}
