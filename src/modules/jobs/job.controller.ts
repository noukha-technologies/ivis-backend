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
import {
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
import { JobService } from './services/job.service';
import { JobIntakeService } from './services/job-intake.service';

@ApiTags('Jobs')
@Controller('jobs')
export class JobController {
  constructor(
    private readonly jobService: JobService,
    private readonly jobIntakeService: JobIntakeService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a job (form intake or legacy IDs)' })
  @ApiResponse({ status: 201, description: 'Job created successfully.' })
  async create(@CurrentUser() actor: UserContext, @Body() createDto: CreateJobRequestDto) {
    if (isLegacyJobCreate(createDto)) {
      const legacyDto: CreateJobDto = {
        job_id: createDto.job_id,
        source: createDto.source!,
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
      return { message: 'Job created successfully', data };
    }

    const data = await this.jobIntakeService.createFromIntake(
      createDto as CreateJobIntakeDto,
      actor,
    );
    const message = data.job
      ? 'Job created successfully'
      : 'Payment recorded (FOC). Job will be created when payment is marked Paid.';

    return { message, data };
  }

  @Post('from-appointment/:appointmentId')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Convert a queued appointment into a job' })
  @ApiParam({ name: 'appointmentId', type: String, description: 'Appointment snowflake ID' })
  @ApiResponse({ status: 201, description: 'Job created from appointment.' })
  async createFromAppointment(
    @CurrentUser() actor: UserContext,
    @Param('appointmentId', ParseSnowflakeIdPipe) appointmentId: string,
  ) {
    const data = await this.jobService.createFromAppointment(appointmentId, actor);
    return { message: 'Job created successfully', data };
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
  @ApiOperation({ summary: 'Retrieve job by ID (with customer, vehicle, and site details)' })
  @ApiParam({ name: 'id', type: String, description: 'Job snowflake ID' })
  @ApiResponse({ status: 200, description: 'Job retrieved successfully.' })
  async findOne(@Param('id', ParseSnowflakeIdPipe) id: string) {
    const data = await this.jobService.findOne(id);
    return { message: 'Job retrieved successfully', data };
  }

  @Get(':id/pricing')
  @ApiOperation({ summary: 'Resolve invoice pricing for a job (charges master lookup)' })
  @ApiParam({ name: 'id', type: String, description: 'Job snowflake ID' })
  async pricing(@Param('id', ParseSnowflakeIdPipe) id: string) {
    const data = await this.jobService.resolvePricing(id);
    return { message: 'Job pricing resolved', data };
  }

  @Post(':id/start')
  @ApiOperation({ summary: 'Start the inspection (generate IN file, set In Progress)' })
  @ApiParam({ name: 'id', type: String, description: 'Job snowflake ID' })
  async start(@Param('id', ParseSnowflakeIdPipe) id: string) {
    const data = await this.jobService.startJob(id);
    return { message: 'Job started', data };
  }

  @Post(':id/submit')
  @ApiOperation({ summary: 'Submit the inspection to ROP (same-day) and complete the job' })
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
