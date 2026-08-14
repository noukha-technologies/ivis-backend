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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  ConvertAppointmentDto,
  CreateJobDto,
  CreateJobIntakeDto,
  CreateJobRequestDto,
  UpdateJobDto,
} from '../../common/dto/job.dto';
import { isLegacyJobCreate } from '../../common/validators/job-create-request.validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { ParseSnowflakeIdPipe } from '../../common/pipes/parse-snowflake-id.pipe';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { UserContext } from '../../common/dto/auth.dto';
import { getCreatedById } from '../../common/utils/created-by.util';
import { JobService } from './services/job.service';
import { JobIntakeService } from './services/job-intake.service';
import { JobImageService } from './services/job-image.service';
import type { JobImageSource } from '../database/entity/job-image.entity';

type UploadedImage = { buffer: Buffer; mimetype: string; size: number };

@ApiTags('Jobs')
@Controller('jobs')
export class JobController {
  constructor(
    private readonly jobService: JobService,
    private readonly jobIntakeService: JobIntakeService,
    private readonly jobImageService: JobImageService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a job (form intake or legacy IDs)' })
  @ApiResponse({ status: 201, description: 'Job created successfully.' })
  async create(
    @CurrentUser() actor: UserContext,
    @Body() createDto: CreateJobRequestDto,
  ) {
    if (isLegacyJobCreate(createDto)) {
      const legacyDto: CreateJobDto = {
        job_id: createDto.job_id,
        status: createDto.status,
        customer_id: createDto.customer_id!,
        vehicle_record_id: createDto.vehicle_record_id!,
        anpr_capture_id: createDto.anpr_capture_id,
        centre_id: createDto.centre_id,
        line_id: createDto.line_id,
        admin_pc_id: createDto.admin_pc_id,
        camera_id: createDto.camera_id,
      };
      const data = await this.jobService.create(legacyDto, actor);
      const pricing = await this.jobService.resolvePricingForJob(data);
      return {
        message: 'Job created successfully',
        data: { ...data, pricing },
      };
    }

    const data = await this.jobIntakeService.createFromIntake(
      createDto as CreateJobIntakeDto,
      actor,
    );
    // Attach the calculated payment (from the configured charges) when a job exists.
    const pricing = data.job
      ? await this.jobService.resolvePricingForJob(data.job)
      : null;
    const message = data.job
      ? 'Job created successfully'
      : 'Payment recorded (FOC). Job will be created when payment is marked Paid.';

    return { message, data: { ...data, pricing } };
  }

  @Post('from-appointment/:appointmentId')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Convert a queued appointment into a job' })
  @ApiParam({
    name: 'appointmentId',
    type: String,
    description: 'Appointment snowflake ID',
  })
  @ApiResponse({ status: 201, description: 'Job created from appointment.' })
  async createFromAppointment(
    @CurrentUser() actor: UserContext,
    @Param('appointmentId', ParseSnowflakeIdPipe) appointmentId: string,
    @Body() body: ConvertAppointmentDto,
  ) {
    const data = await this.jobService.createFromAppointment(
      appointmentId,
      actor,
      { line_id: body.line_id, assigned_user_id: body.assigned_user_id },
    );
    const pricing = await this.jobService.resolvePricingForJob(data);
    return { message: 'Job created successfully', data: { ...data, pricing } };
  }

  @Get()
  @ApiOperation({ summary: 'Retrieve jobs (paginated, filterable, sortable)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['ASC', 'DESC'] })
  @ApiQuery({ name: 'filters', required: false, type: String })
  @ApiQuery({ name: 'nonPaginated', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Jobs retrieved successfully.' })
  async findAll(@Query() query: PaginationQueryDto) {
    const result = await this.jobService.findAll(query);
    return { message: 'Jobs retrieved successfully', ...result };
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Retrieve job by ID (with customer, vehicle, and site details)',
  })
  @ApiParam({ name: 'id', type: String, description: 'Job snowflake ID' })
  @ApiResponse({ status: 200, description: 'Job retrieved successfully.' })
  async findOne(@Param('id', ParseSnowflakeIdPipe) id: string) {
    const data = await this.jobService.findOne(id);
    const pricing = await this.jobService.resolvePricingForJob(data);
    return {
      message: 'Job retrieved successfully',
      data: { ...data, pricing },
    };
  }

  @Get(':id/pricing')
  @ApiOperation({
    summary: 'Resolve invoice pricing for a job (charges master lookup)',
  })
  @ApiParam({ name: 'id', type: String, description: 'Job snowflake ID' })
  async pricing(@Param('id', ParseSnowflakeIdPipe) id: string) {
    const data = await this.jobService.resolvePricing(id);
    return { message: 'Job pricing resolved', data };
  }

  @Get(':id/in-file')
  @ApiOperation({ summary: 'Retrieve raw IN file contents for a job' })
  @ApiParam({ name: 'id', type: String, description: 'Job snowflake ID' })
  async inFile(@Param('id', ParseSnowflakeIdPipe) id: string) {
    const data = await this.jobService.getInFileContent(id);
    return { message: 'IN file retrieved', data };
  }

  @Post(':id/images')
  @ApiOperation({ summary: 'Upload or capture a photo for a job' })
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'id', type: String, description: 'Job snowflake ID' })
  @UseInterceptors(FileInterceptor('image'))
  async uploadImage(
    @CurrentUser() actor: UserContext,
    @Param('id', ParseSnowflakeIdPipe) id: string,
    @UploadedFile() file: UploadedImage,
    @Body('source') source: JobImageSource,
  ) {
    const data = await this.jobImageService.addImage(
      id,
      file,
      source === 'CAPTURE' ? 'CAPTURE' : 'UPLOAD',
      getCreatedById(actor),
    );
    return { message: 'Job image uploaded successfully', data };
  }

  @Delete(':id/images/:imageId')
  @ApiOperation({ summary: 'Remove a job image' })
  @ApiParam({ name: 'id', type: String, description: 'Job snowflake ID' })
  @ApiParam({
    name: 'imageId',
    type: String,
    description: 'Job image snowflake ID',
  })
  async deleteImage(
    @Param('id', ParseSnowflakeIdPipe) id: string,
    @Param('imageId', ParseSnowflakeIdPipe) imageId: string,
  ) {
    await this.jobImageService.removeImage(id, imageId);
    return { message: 'Job image deleted successfully', data: null };
  }

  @Post(':id/start')
  @ApiOperation({
    summary: 'Start the inspection (generate IN file, set In Progress)',
  })
  @ApiParam({ name: 'id', type: String, description: 'Job snowflake ID' })
  async start(@Param('id', ParseSnowflakeIdPipe) id: string) {
    const data = await this.jobService.startJob(id);
    return { message: 'Job started', data };
  }

  @Post(':id/submit')
  @ApiOperation({
    summary: 'Submit the inspection to ROP (same-day) and complete the job',
  })
  @ApiParam({ name: 'id', type: String, description: 'Job snowflake ID' })
  async submit(@Param('id', ParseSnowflakeIdPipe) id: string) {
    const data = await this.jobService.submitJob(id);
    return { message: 'Job submitted', data };
  }

  @Post(':id/redo')
  @ApiOperation({ summary: 'Flag the job for a redo test' })
  @ApiParam({ name: 'id', type: String, description: 'Job snowflake ID' })
  async redo(@Param('id', ParseSnowflakeIdPipe) id: string) {
    const data = await this.jobService.redoJob(id);
    return { message: 'Job flagged for redo', data };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update job by ID' })
  @ApiParam({ name: 'id', type: String, description: 'Job snowflake ID' })
  @ApiResponse({ status: 200, description: 'Job updated successfully.' })
  async update(
    @Param('id', ParseSnowflakeIdPipe) id: string,
    @Body() updateDto: UpdateJobDto,
  ) {
    const data = await this.jobService.update(id, updateDto);
    return { message: 'Job updated successfully', data };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete job' })
  @ApiParam({ name: 'id', type: String, description: 'Job snowflake ID' })
  @ApiResponse({ status: 200, description: 'Job deleted successfully.' })
  async remove(@Param('id', ParseSnowflakeIdPipe) id: string) {
    await this.jobService.remove(id);
    return { message: 'Job deleted successfully', data: null };
  }
}
