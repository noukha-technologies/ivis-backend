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
import { CreateCentreDto, UpdateCentreDto } from '../../../common/dto/centre.dto';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { CentreService } from './services/centre.service';

@ApiTags('Masters / Centres')
@Controller('masters/centres')
export class CentreController {
  constructor(private readonly centreService: CentreService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new centre' })
  @ApiResponse({ status: 201, description: 'Centre created successfully.' })
  @ApiResponse({ status: 400, description: 'Validation failed.' })
  @ApiResponse({ status: 409, description: 'Duplicate code or centre_id.' })
  async create(@Body() createCentreDto: CreateCentreDto) {
    const centre = await this.centreService.create(createCentreDto);
    return { message: 'Centre created successfully', data: centre };
  }

  @Get()
  @ApiOperation({ summary: 'Retrieve all centres (paginated, filterable, sortable)' })
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
  @ApiResponse({ status: 200, description: 'Centres list retrieved.' })
  async findAll(@Query() query: PaginationQueryDto) {
    const result = await this.centreService.findAll(query);
    return { message: 'Centres retrieved successfully', ...result };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Retrieve a centre by ID' })
  @ApiParam({ name: 'id', type: String, description: 'Centre snowflake ID' })
  @ApiResponse({ status: 200, description: 'Centre retrieved successfully.' })
  @ApiResponse({ status: 404, description: 'Centre not found.' })
  async findOne(@Param('id', ParseSnowflakeIdPipe) id: string) {
    const centre = await this.centreService.findOne(id);
    return { message: 'Centre retrieved successfully', data: centre };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update centre details' })
  @ApiParam({ name: 'id', type: String, description: 'Centre snowflake ID' })
  @ApiResponse({ status: 200, description: 'Centre updated successfully.' })
  @ApiResponse({ status: 404, description: 'Centre not found.' })
  @ApiResponse({ status: 409, description: 'Duplicate code.' })
  async update(
    @Param('id', ParseSnowflakeIdPipe) id: string,
    @Body() updateCentreDto: UpdateCentreDto,
  ) {
    const centre = await this.centreService.update(id, updateCentreDto);
    return { message: 'Centre updated successfully', data: centre };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a centre' })
  @ApiParam({ name: 'id', type: String, description: 'Centre snowflake ID' })
  @ApiResponse({ status: 200, description: 'Centre deleted successfully.' })
  @ApiResponse({ status: 404, description: 'Centre not found.' })
  async remove(@Param('id', ParseSnowflakeIdPipe) id: string) {
    await this.centreService.remove(id);
    return { message: 'Centre deleted successfully', data: null };
  }
}
