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
import { CreateJobDto, UpdateJobDto } from '../../common/dto/job.dto';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { ParseSnowflakeIdPipe } from '../../common/pipes/parse-snowflake-id.pipe';
import { JobService } from './services/job.service';

@ApiTags('Jobs')
@Controller('jobs')
export class JobController {
  constructor(private readonly jobService: JobService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a job' })
  @ApiResponse({ status: 201, description: 'Job created successfully.' })
  async create(@Body() createDto: CreateJobDto) {
    const data = await this.jobService.create(createDto);
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
