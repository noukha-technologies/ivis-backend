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
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import {
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

type UploadedImage = { buffer: Buffer; originalname: string };

import type { UserContext } from '../../../common/dto/auth.dto';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import {
  CreateAnprCaptureDto,
  UpdateAnprCaptureDto,
} from '../../../common/dto/anpr-capture.dto';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ParseSnowflakeIdPipe } from '../../../common/pipes/parse-snowflake-id.pipe';

import { AnprCaptureService } from './services/anpr-capture.service';

@ApiTags('Transactions / ANPR Captures')
@Controller('transactions/anpr-captures')
export class AnprCaptureController {
  constructor(private readonly anprCaptureService: AnprCaptureService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an ANPR capture record' })
  @ApiResponse({
    status: 201,
    description: 'ANPR capture created successfully.',
  })
  async create(
    @CurrentUser() actor: UserContext,
    @Body() createDto: CreateAnprCaptureDto,
  ) {
    const data = await this.anprCaptureService.create(createDto, actor);
    return { message: 'ANPR capture created successfully', data };
  }

  @Post(':id/images')
  @ApiOperation({
    summary: 'Upload plate and/or scene images for an ANPR capture',
  })
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Images uploaded successfully.' })
  @ApiResponse({ status: 404, description: 'ANPR capture not found.' })
  @ApiQuery({
    name: 'skipAudit',
    required: false,
    type: Boolean,
    description:
      'When true, image upload is not written to audit (used immediately after create).',
  })
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'plate', maxCount: 1 },
      { name: 'scene', maxCount: 1 },
    ]),
  )
  async uploadImages(
    @Param('id', ParseSnowflakeIdPipe) id: string,
    @Query('skipAudit') skipAudit: string | undefined,
    @UploadedFiles()
    files: { plate?: UploadedImage[]; scene?: UploadedImage[] },
  ) {
    const data = await this.anprCaptureService.attachImages(
      id,
      {
        plate: files?.plate?.[0]?.buffer,
        scene: files?.scene?.[0]?.buffer,
      },
      { skipAudit: skipAudit === 'true' },
    );
    return { message: 'ANPR capture images uploaded successfully', data };
  }

  @Delete(':id/images')
  @ApiOperation({
    summary: 'Remove plate and/or scene images from an ANPR capture',
  })
  @ApiParam({ name: 'id', type: String })
  @ApiQuery({
    name: 'plate',
    required: false,
    type: Boolean,
    description: 'When true, clears the plate image.',
  })
  @ApiQuery({
    name: 'scene',
    required: false,
    type: Boolean,
    description: 'When true, clears the scene image.',
  })
  @ApiResponse({ status: 200, description: 'Images removed successfully.' })
  @ApiResponse({ status: 404, description: 'ANPR capture not found.' })
  async removeImages(
    @Param('id', ParseSnowflakeIdPipe) id: string,
    @Query('plate') plate: string | undefined,
    @Query('scene') scene: string | undefined,
  ) {
    const data = await this.anprCaptureService.removeImages(id, {
      plate: plate === 'true',
      scene: scene === 'true',
    });
    return { message: 'ANPR capture images removed successfully', data };
  }

  @Get()
  @ApiOperation({
    summary: 'Retrieve ANPR captures (paginated, filterable, sortable)',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['ASC', 'DESC'] })
  @ApiQuery({ name: 'filters', required: false, type: String })
  @ApiQuery({ name: 'nonPaginated', required: false, type: Boolean })
  @ApiResponse({
    status: 200,
    description: 'ANPR captures retrieved successfully.',
  })
  async findAll(@Query() query: PaginationQueryDto) {
    const result = await this.anprCaptureService.findAll(query);
    return { message: 'ANPR captures retrieved successfully', ...result };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Retrieve ANPR capture by ID' })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'ANPR capture snowflake ID',
  })
  @ApiResponse({
    status: 200,
    description: 'ANPR capture retrieved successfully.',
  })
  async findOne(@Param('id', ParseSnowflakeIdPipe) id: string) {
    const data = await this.anprCaptureService.findOne(id);
    return { message: 'ANPR capture retrieved successfully', data };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update ANPR capture by ID' })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'ANPR capture snowflake ID',
  })
  @ApiResponse({
    status: 200,
    description: 'ANPR capture updated successfully.',
  })
  async update(
    @Param('id', ParseSnowflakeIdPipe) id: string,
    @Body() updateDto: UpdateAnprCaptureDto,
  ) {
    const data = await this.anprCaptureService.update(id, updateDto);
    return { message: 'ANPR capture updated successfully', data };
  }

  @Patch(':id/validate')
  @ApiOperation({
    summary: 'Validate an ANPR capture and queue an appointment',
  })
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiParam({
    name: 'id',
    type: String,
    description: 'ANPR capture snowflake ID',
  })
  @ApiQuery({
    name: 'removePlate',
    required: false,
    type: Boolean,
    description: 'When true, clears the plate image as part of validate.',
  })
  @ApiQuery({
    name: 'removeScene',
    required: false,
    type: Boolean,
    description: 'When true, clears the scene image as part of validate.',
  })
  @ApiResponse({
    status: 200,
    description: 'ANPR capture validated and appointment queued.',
  })
  @ApiResponse({
    status: 400,
    description: "Selected line does not belong to the camera's centre.",
  })
  @ApiResponse({ status: 404, description: 'ANPR capture not found.' })
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'plate', maxCount: 1 },
      { name: 'scene', maxCount: 1 },
    ]),
  )
  async validate(
    @CurrentUser() actor: UserContext,
    @Param('id', ParseSnowflakeIdPipe) id: string,
    @Body() body: UpdateAnprCaptureDto & { payload?: string },
    @Query('removePlate') removePlate: string | undefined,
    @Query('removeScene') removeScene: string | undefined,
    @UploadedFiles()
    files?: { plate?: UploadedImage[]; scene?: UploadedImage[] },
  ) {
    const updateDto =
      typeof body?.payload === 'string'
        ? (JSON.parse(body.payload) as UpdateAnprCaptureDto)
        : body;
    const hasMedia =
      Boolean(files?.plate?.[0]) ||
      Boolean(files?.scene?.[0]) ||
      removePlate === 'true' ||
      removeScene === 'true';
    const data = await this.anprCaptureService.validate(
      id,
      updateDto,
      actor,
      hasMedia
        ? {
            plate: files?.plate?.[0]?.buffer,
            scene: files?.scene?.[0]?.buffer,
            removePlate: removePlate === 'true',
            removeScene: removeScene === 'true',
          }
        : undefined,
    );
    return { message: 'ANPR capture validated successfully', data };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete ANPR capture' })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'ANPR capture snowflake ID',
  })
  @ApiResponse({
    status: 200,
    description: 'ANPR capture deleted successfully.',
  })
  async remove(@Param('id', ParseSnowflakeIdPipe) id: string) {
    await this.anprCaptureService.remove(id);
    return { message: 'ANPR capture deleted successfully', data: null };
  }
}
