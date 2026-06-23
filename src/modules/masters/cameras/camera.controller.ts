import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import type { UserContext } from '../../../common/dto/auth.dto.js';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import { CreateCameraDto, UpdateCameraDto } from '../../../common/dto/camera.dto.js';

import { CameraService } from './services/camera.service.js';
import { AppLogger } from '../../../common/logger/app.logger.js';
import { CameraHealthCheckService } from './services/camera-health-check.service.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import { ParseSnowflakeIdPipe } from '../../../common/pipes/parse-snowflake-id.pipe.js';

@ApiTags('Masters / Cameras')
@Controller('masters/cameras')
export class CameraController {
  private static readonly context = 'CameraController';

  constructor(
    private readonly logger: AppLogger,
    private readonly cameraService: CameraService,
    private readonly cameraHealthCheck: CameraHealthCheckService,
  ) { }

  // ─── CRUD ────────────────────────────────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new camera' })
  @ApiResponse({ status: 201, description: 'Camera created successfully.' })
  @ApiResponse({ status: 400, description: 'Validation failed.' })
  @ApiResponse({ status: 409, description: 'Duplicate code or camera_id.' })
  async create(@CurrentUser() actor: UserContext, @Body() createCameraDto: CreateCameraDto) {
    const camera = await this.cameraService.create(createCameraDto, actor);
    void this.cameraHealthCheck.performFullHealthCheck(camera.id).catch((err: unknown) => {
      this.logger.warn(
        `Initial health check failed for camera ${camera.id}: ${(err as Error).message}`,
        CameraController.context,
      );
    });
    return { message: 'Camera created successfully', data: camera };
  }

  @Get()
  @ApiOperation({ summary: 'Retrieve all cameras (paginated, filterable, sortable)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'name, code, type' })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['ASC', 'DESC'] })
  @ApiResponse({ status: 200, description: 'Cameras list retrieved.' })
  async findAll(@Query() query: PaginationQueryDto) {
    const result = await this.cameraService.findAll(query);
    return { message: 'Cameras retrieved successfully', ...result };
  }

  // ─── Health: static routes (must be before :id routes) ───────────────────────

  @Get('health/summary')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Health summary for all cameras (cached DB fields)' })
  getHealthSummary() {
    return this.cameraHealthCheck.getHealthSummaryForAll();
  }

  @Post('health/run-all')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Run ping health check on every active camera' })
  async runHealthChecksOnAll() {
    await this.cameraHealthCheck.runAllChecksNow();
    return {
      message: 'Health checks completed for active cameras',
      timestamp: new Date().toISOString(),
    };
  }

  // ─── Health: per-camera routes (:id must come after static routes) ─────────

  @Get(':id/health')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Run on-demand ping health check for one camera' })
  @ApiParam({ name: 'id', type: String, description: 'Camera snowflake ID' })
  async checkCameraHealth(@Param('id', ParseSnowflakeIdPipe) id: string) {
    const result = await this.cameraHealthCheck.performFullHealthCheck(id);
    if (!result) {
      throw new NotFoundException(`Camera with id ${id} not found`);
    }
    return result;
  }

  @Get(':id/health/history')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Health snapshot for a camera' })
  @ApiParam({ name: 'id', type: String, description: 'Camera snowflake ID' })
  async getCameraHealthHistory(@Param('id', ParseSnowflakeIdPipe) id: string) {
    const snapshot = await this.cameraHealthCheck.getHealthHistorySnapshot(id);
    if (!snapshot) {
      throw new NotFoundException(`Camera with id ${id} not found`);
    }
    return snapshot;
  }

  // ─── CRUD: by-id routes ───────────────────────────────────────────────────

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
  async update(@Param('id', ParseSnowflakeIdPipe) id: string, @Body() updateCameraDto: UpdateCameraDto) {
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
