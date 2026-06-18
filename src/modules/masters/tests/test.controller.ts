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
import { CreateTestDto, UpdateTestDto } from '../../../common/dto/test.dto';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { TestService } from './services/test.service';

@ApiTags('Masters / Tests')
@Controller('masters/tests')
export class TestController {
  constructor(private readonly testService: TestService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new test master record' })
  @ApiResponse({ status: 201, description: 'Test master created successfully.' })
  @ApiResponse({ status: 400, description: 'Validation failed.' })
  @ApiResponse({ status: 409, description: 'Duplicate code or test_id.' })
  async create(@CurrentUser() actor: UserContext, @Body() createTestDto: CreateTestDto) {
    const test = await this.testService.create(createTestDto, actor);
    return { message: 'Test master created successfully', data: test };
  }

  @Get()
  @ApiOperation({ summary: 'Retrieve all test masters (paginated, filterable, sortable)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'name, code, status',
  })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['ASC', 'DESC'] })
  @ApiQuery({ name: 'filters', required: false, type: String })
  @ApiQuery({ name: 'nonPaginated', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Test masters list retrieved.' })
  async findAll(@Query() query: PaginationQueryDto) {
    const result = await this.testService.findAll(query);
    return { message: 'Test masters retrieved successfully', ...result };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Retrieve a test master by ID' })
  @ApiParam({ name: 'id', type: String, description: 'Test master snowflake ID' })
  @ApiResponse({ status: 200, description: 'Test master retrieved successfully.' })
  @ApiResponse({ status: 404, description: 'Test master not found.' })
  async findOne(@Param('id', ParseSnowflakeIdPipe) id: string) {
    const test = await this.testService.findOne(id);
    return { message: 'Test master retrieved successfully', data: test };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update test master details' })
  @ApiParam({ name: 'id', type: String, description: 'Test master snowflake ID' })
  @ApiResponse({ status: 200, description: 'Test master updated successfully.' })
  @ApiResponse({ status: 404, description: 'Test master not found.' })
  @ApiResponse({ status: 409, description: 'Duplicate code.' })
  async update(
    @Param('id', ParseSnowflakeIdPipe) id: string,
    @Body() updateTestDto: UpdateTestDto,
  ) {
    const test = await this.testService.update(id, updateTestDto);
    return { message: 'Test master updated successfully', data: test };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a test master' })
  @ApiParam({ name: 'id', type: String, description: 'Test master snowflake ID' })
  @ApiResponse({ status: 200, description: 'Test master deleted successfully.' })
  @ApiResponse({ status: 404, description: 'Test master not found.' })
  async remove(@Param('id', ParseSnowflakeIdPipe) id: string) {
    await this.testService.remove(id);
    return { message: 'Test master deleted successfully', data: null };
  }
}
