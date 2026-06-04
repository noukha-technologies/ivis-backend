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
import { CreateCameraDto, UpdateCameraDto } from '../../../common/dto/camera.dto';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { CameraService } from './services/camera.service';

@ApiTags('Masters / Cameras')
@Controller('masters/cameras')
export class CameraController {
  constructor(private readonly cameraService: CameraService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new camera' })
  @ApiResponse({ status: 201, description: 'Camera created successfully.' })
  @ApiResponse({ status: 400, description: 'Validation failed.' })
  @ApiResponse({ status: 409, description: 'Duplicate code or camera_id.' })
  async create(
    @CurrentUser() actor: UserContext,
    @Body() createCameraDto: CreateCameraDto,
  ) {
    const camera = await this.cameraService.create(createCameraDto, actor);
    return { message: 'Camera created successfully', data: camera };
  }

  @Get()
  @ApiOperation({ summary: 'Retrieve all cameras (paginated, filterable, sortable)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'name, code, type',
  })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['ASC', 'DESC'] })
  @ApiResponse({ status: 200, description: 'Cameras list retrieved.' })
  async findAll(@Query() query: PaginationQueryDto) {
    const result = await this.cameraService.findAll(query);
    return { message: 'Cameras retrieved successfully', ...result };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Retrieve a camera by ID' })
  @ApiParam({ name: 'id', type: String, description: 'Camera snowflake ID' })
  @ApiResponse({ status: 200, description: 'Camera retrieved successfully.' })
  @ApiResponse({ status: 404, description: 'Camera not found.' })
  async findOne(@Param('id', ParseSnowflakeIdPipe) id: string) {
    const camera = await this.cameraService.findOne(id);
    return { message: 'Camera retrieved successfully', data: camera };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update camera details' })
  @ApiParam({ name: 'id', type: String, description: 'Camera snowflake ID' })
  @ApiResponse({ status: 200, description: 'Camera updated successfully.' })
  @ApiResponse({ status: 404, description: 'Camera not found.' })
  @ApiResponse({ status: 409, description: 'Duplicate code.' })
  async update(
    @Param('id', ParseSnowflakeIdPipe) id: string,
    @Body() updateCameraDto: UpdateCameraDto,
  ) {
    const camera = await this.cameraService.update(id, updateCameraDto);
    return { message: 'Camera updated successfully', data: camera };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a camera' })
  @ApiParam({ name: 'id', type: String, description: 'Camera snowflake ID' })
  @ApiResponse({ status: 200, description: 'Camera deleted successfully.' })
  @ApiResponse({ status: 404, description: 'Camera not found.' })
  async remove(@Param('id', ParseSnowflakeIdPipe) id: string) {
    await this.cameraService.remove(id);
    return { message: 'Camera deleted successfully', data: null };
  }
}
