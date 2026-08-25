import {
  BadRequestException,
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
  GenerateOutfileDto,
  SetJobChargeDto,
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
import { OutfileGeneratorService } from './services/outfile-generator.service';
import { TajdeedOutboxService } from '../transactions/tajdeed-events/services/tajdeed-outbox.service';
import type { JobImageSource } from '../database/entity/job-image.entity';

type UploadedImage = { buffer: Buffer; mimetype: string; size: number };

@ApiTags('Jobs')
@Controller('jobs')
export class JobController {
  constructor(
    private readonly jobService: JobService,
    private readonly jobIntakeService: JobIntakeService,
    private readonly jobImageService: JobImageService,
    private readonly outfileGenerator: OutfileGeneratorService,
    private readonly outbox: TajdeedOutboxService,
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

@Get('provider-events')
  @ApiOperation({
    summary: 'Latest provider delivery state for several jobs',
    description:
      'Batched for the job list, which needs a whole page at once. Jobs with nothing queued are simply absent from the response.',
  })
  @ApiQuery({
    name: 'jobIds',
    required: true,
    description: 'Comma-separated job snowflake IDs',
  })
  async providerEvents(@Query('jobIds') jobIds?: string) {
    // MUST stay above @Get(':id') — Nest matches in declaration order, and
    // below it "provider-events" would be parsed as a job id.
    const ids = (jobIds ?? '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
    const data = await this.outbox.latestForJobs(ids);
    return { message: 'Provider events retrieved', data };
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

  @Patch(':id/charge')
  @ApiOperation({
    summary: "Map this job onto a Charges-master row (the operator's pricing choice)",
    description:
      "For a vehicle whose own type is not priced at this centre — a Sedan where only SUV is configured. The mapped charge is what the job is priced from, and the payment amount is derived from it server-side. Send charge_id: null to clear the mapping and fall back to the vehicle's type. Refused once the job has been paid.",
  })
  @ApiParam({ name: 'id', type: String, description: 'Job snowflake ID' })
  @ApiResponse({ status: 200, description: 'Charge mapped; pricing returned.' })
  @ApiResponse({
    status: 400,
    description:
      'Unknown charge, a charge from another centre, or the job is already paid.',
  })
  async setCharge(
    @Param('id', ParseSnowflakeIdPipe) id: string,
    @Body() body: SetJobChargeDto,
  ) {
    const data = await this.jobService.setCharge(id, body.charge_id ?? null);
    const pricing = await this.jobService.resolvePricingForJob(data);
    return {
      message: 'Job charge updated successfully',
      data: { ...data, pricing },
    };
  }

  @Get(':id/in-file')
  @ApiOperation({ summary: 'Retrieve raw IN file contents for a job' })
  @ApiParam({ name: 'id', type: String, description: 'Job snowflake ID' })
  async inFile(@Param('id', ParseSnowflakeIdPipe) id: string) {
    const data = await this.jobService.getInFileContent(id);
    return { message: 'IN file retrieved', data };
  }

  @Get(':id/out-file')
  @ApiOperation({ summary: 'Retrieve raw OUT file contents for a job' })
  @ApiParam({ name: 'id', type: String, description: 'Job snowflake ID' })
  async outFile(@Param('id', ParseSnowflakeIdPipe) id: string) {
    const data = await this.jobService.getOutFileContent(id);
    return { message: 'OUT file retrieved', data };
  }

@Get(':id/provider-event')
  @ApiOperation({
    summary: "This job's latest inspection-result event at the provider",
    description:
      'null when nothing was ever queued — a walk-in, or a job the provider has no booking for. That is a normal state, not an error.',
  })
  @ApiParam({ name: 'id', type: String, description: 'Job snowflake ID' })
  async providerEvent(@Param('id', ParseSnowflakeIdPipe) id: string) {
    const data = await this.outbox.latestForJob(id);
    return { message: 'Provider event retrieved', data };
  }

  @Post(':id/provider-event/retry')
  @ApiOperation({
    summary: "Re-send this job's inspection result to the provider now",
    description:
      'Queues a fresh event under a new transaction id — the provider never reprocesses a rejected one. Use once the booking has been checked in; the automatic retry otherwise waits 30 minutes.',
  })
  @ApiParam({ name: 'id', type: String, description: 'Job snowflake ID' })
  async retryProviderEvent(@Param('id', ParseSnowflakeIdPipe) id: string) {
    const data = await this.outbox.pushNowForJob(id);
    if (!data) {
      throw new BadRequestException(
        'This job has no inspection result queued for the provider, so there is nothing to re-send.',
      );
    }
    return { message: 'Inspection result re-queued for the provider', data };
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

  @Post('dev/outfile')
  @ApiOperation({
    summary: 'Generate a synthetic OUT file for a plate (development only)',
    description:
      'Writes a rig-shaped result file into the Admin PC OUT folder, where the normal watcher picks it up within ~5s. Exists because the inspection rig is not present outside a centre. Refused in production.',
  })
  @ApiResponse({ status: 201, description: 'OUT file written' })
  async generateOutfile(@Body() dto: GenerateOutfileDto) {
    const data = await this.outfileGenerator.generate(
      dto.plate_number,
      dto.result ?? 'pass',
    );
    return {
      message: `OUT file generated for ${data.plate} (${data.result})`,
      data,
    };
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
