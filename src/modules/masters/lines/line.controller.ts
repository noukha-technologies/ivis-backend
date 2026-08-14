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
import { CreateLineDto, UpdateLineDto } from '../../../common/dto/line.dto';
import { LineListQueryDto } from '../../../common/dto/line-list-query.dto';
import { LineService } from './services/line.service';

@ApiTags('Masters / Lines')
@Controller('masters/lines')
export class LineController {
  constructor(private readonly lineService: LineService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new line' })
  @ApiResponse({ status: 201, description: 'Line created successfully.' })
  @ApiResponse({ status: 400, description: 'Validation failed.' })
  @ApiResponse({ status: 409, description: 'Duplicate code or line_id.' })
  async create(
    @CurrentUser() actor: UserContext,
    @Body() createLineDto: CreateLineDto,
  ) {
    const line = await this.lineService.create(createLineDto, actor);
    return { message: 'Line created successfully', data: line };
  }

  @Get()
  @ApiOperation({
    summary: 'Retrieve all lines (paginated, filterable, sortable)',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'name, code',
  })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['ASC', 'DESC'] })
  @ApiQuery({ name: 'filters', required: false, type: String })
  @ApiQuery({ name: 'nonPaginated', required: false, type: Boolean })
  @ApiQuery({
    name: 'centre_id',
    required: false,
    type: String,
    description: 'Filter by centre snowflake ID',
  })
  @ApiResponse({ status: 200, description: 'Lines list retrieved.' })
  async findAll(@Query() query: LineListQueryDto) {
    const result = await this.lineService.findAll(query);
    return { message: 'Lines retrieved successfully', ...result };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Retrieve a line by ID' })
  @ApiParam({ name: 'id', type: String, description: 'Line snowflake ID' })
  @ApiResponse({ status: 200, description: 'Line retrieved successfully.' })
  @ApiResponse({ status: 404, description: 'Line not found.' })
  async findOne(@Param('id', ParseSnowflakeIdPipe) id: string) {
    const line = await this.lineService.findOne(id);
    return { message: 'Line retrieved successfully', data: line };
  }

  @Get(':id/users')
  @ApiOperation({
    summary: 'Users assigned to this line',
    description:
      'Active users mapped to the line via user_line_mappings — the candidates a job running on this line can be assigned to. A line with no mapped users returns an empty list.',
  })
  @ApiParam({ name: 'id', type: String, description: 'Line snowflake ID' })
  @ApiResponse({ status: 200, description: 'Users retrieved successfully.' })
  @ApiResponse({ status: 404, description: 'Line not found.' })
  async findUsers(@Param('id', ParseSnowflakeIdPipe) id: string) {
    const users = await this.lineService.findAssignableUsers(id);
    return { message: 'Line users retrieved successfully', data: users };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update line details' })
  @ApiParam({ name: 'id', type: String, description: 'Line snowflake ID' })
  @ApiResponse({ status: 200, description: 'Line updated successfully.' })
  @ApiResponse({ status: 404, description: 'Line not found.' })
  @ApiResponse({ status: 409, description: 'Duplicate code.' })
  async update(
    @Param('id', ParseSnowflakeIdPipe) id: string,
    @Body() updateLineDto: UpdateLineDto,
  ) {
    const line = await this.lineService.update(id, updateLineDto);
    return { message: 'Line updated successfully', data: line };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a line' })
  @ApiParam({ name: 'id', type: String, description: 'Line snowflake ID' })
  @ApiResponse({ status: 200, description: 'Line deleted successfully.' })
  @ApiResponse({ status: 404, description: 'Line not found.' })
  async remove(@Param('id', ParseSnowflakeIdPipe) id: string) {
    await this.lineService.remove(id);
    return { message: 'Line deleted successfully', data: null };
  }
}
