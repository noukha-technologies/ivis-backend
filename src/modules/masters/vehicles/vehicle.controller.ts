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
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { UserContext } from '../../../common/dto/auth.dto';
import { ParseSnowflakeIdPipe } from '../../../common/pipes/parse-snowflake-id.pipe';
import { CreateVehicleDto, UpdateVehicleDto } from '../../../common/dto/vehicle.dto';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { VehicleService } from './services/vehicle.service';

@ApiTags('Masters / Vehicles')
@Controller('masters/vehicles')
export class VehicleController {
  constructor(private readonly vehicleService: VehicleService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new vehicle type master record' })
  @ApiResponse({ status: 201, description: 'Vehicle master created successfully.' })
  @ApiResponse({ status: 400, description: 'Validation failed.' })
  @ApiResponse({ status: 409, description: 'Duplicate code or vehicle_id.' })
  async create(
    @CurrentUser() actor: UserContext,
    @Body() createVehicleDto: CreateVehicleDto,
  ) {
    const vehicle = await this.vehicleService.create(createVehicleDto, actor);
    return { message: 'Vehicle master created successfully', data: vehicle };
  }

  @Get()
  @ApiOperation({ summary: 'Retrieve all vehicle type masters (paginated, filterable, sortable)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'name, code, vin_no, status',
  })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['ASC', 'DESC'] })
  @ApiQuery({ name: 'filters', required: false, type: String })
  @ApiQuery({ name: 'nonPaginated', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Vehicle masters list retrieved.' })
  async findAll(@Query() query: PaginationQueryDto) {
    const result = await this.vehicleService.findAll(query);
    return { message: 'Vehicle masters retrieved successfully', ...result };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Retrieve a vehicle type master by ID' })
  @ApiParam({ name: 'id', type: String, description: 'Vehicle master snowflake ID' })
  @ApiResponse({ status: 200, description: 'Vehicle master retrieved successfully.' })
  @ApiResponse({ status: 404, description: 'Vehicle master not found.' })
  async findOne(@Param('id', ParseSnowflakeIdPipe) id: string) {
    const vehicle = await this.vehicleService.findOne(id);
    return { message: 'Vehicle master retrieved successfully', data: vehicle };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update vehicle type master details' })
  @ApiParam({ name: 'id', type: String, description: 'Vehicle master snowflake ID' })
  @ApiResponse({ status: 200, description: 'Vehicle master updated successfully.' })
  @ApiResponse({ status: 404, description: 'Vehicle master not found.' })
  @ApiResponse({ status: 409, description: 'Duplicate code.' })
  async update(
    @Param('id', ParseSnowflakeIdPipe) id: string,
    @Body() updateVehicleDto: UpdateVehicleDto,
  ) {
    const vehicle = await this.vehicleService.update(id, updateVehicleDto);
    return { message: 'Vehicle master updated successfully', data: vehicle };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a vehicle type master' })
  @ApiParam({ name: 'id', type: String, description: 'Vehicle master snowflake ID' })
  @ApiResponse({ status: 200, description: 'Vehicle master deleted successfully.' })
  @ApiResponse({ status: 404, description: 'Vehicle master not found.' })
  async remove(@Param('id', ParseSnowflakeIdPipe) id: string) {
    await this.vehicleService.remove(id);
    return { message: 'Vehicle master deleted successfully', data: null };
  }
}
