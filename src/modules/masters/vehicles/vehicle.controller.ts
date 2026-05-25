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
  @ApiOperation({ summary: 'Create a new vehicle' })
  @ApiResponse({ status: 201, description: 'Vehicle created successfully.' })
  @ApiResponse({ status: 400, description: 'Validation failed.' })
  @ApiResponse({ status: 409, description: 'Duplicate plate number or vehicle_id.' })
  async create(@Body() createVehicleDto: CreateVehicleDto) {
    const vehicle = await this.vehicleService.create(createVehicleDto);
    return { message: 'Vehicle created successfully', data: vehicle };
  }

  @Get()
  @ApiOperation({ summary: 'Retrieve all vehicles (paginated, filterable, sortable)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'plate_number, vehicle_type, vehicle_color, vehicle_brand',
  })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['ASC', 'DESC'] })
  @ApiQuery({ name: 'filters', required: false, type: String })
  @ApiQuery({ name: 'nonPaginated', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Vehicles list retrieved.' })
  async findAll(@Query() query: PaginationQueryDto) {
    const result = await this.vehicleService.findAll(query);
    return { message: 'Vehicles retrieved successfully', ...result };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Retrieve a vehicle by ID' })
  @ApiParam({ name: 'id', type: String, description: 'Vehicle snowflake ID' })
  @ApiResponse({ status: 200, description: 'Vehicle retrieved successfully.' })
  @ApiResponse({ status: 404, description: 'Vehicle not found.' })
  async findOne(@Param('id', ParseSnowflakeIdPipe) id: string) {
    const vehicle = await this.vehicleService.findOne(id);
    return { message: 'Vehicle retrieved successfully', data: vehicle };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update vehicle details' })
  @ApiParam({ name: 'id', type: String, description: 'Vehicle snowflake ID' })
  @ApiResponse({ status: 200, description: 'Vehicle updated successfully.' })
  @ApiResponse({ status: 404, description: 'Vehicle not found.' })
  @ApiResponse({ status: 409, description: 'Duplicate plate number.' })
  async update(
    @Param('id', ParseSnowflakeIdPipe) id: string,
    @Body() updateVehicleDto: UpdateVehicleDto,
  ) {
    const vehicle = await this.vehicleService.update(id, updateVehicleDto);
    return { message: 'Vehicle updated successfully', data: vehicle };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a vehicle' })
  @ApiParam({ name: 'id', type: String, description: 'Vehicle snowflake ID' })
  @ApiResponse({ status: 200, description: 'Vehicle deleted successfully.' })
  @ApiResponse({ status: 404, description: 'Vehicle not found.' })
  async remove(@Param('id', ParseSnowflakeIdPipe) id: string) {
    await this.vehicleService.remove(id);
    return { message: 'Vehicle deleted successfully', data: null };
  }
}
