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
  CreateAnprCaptureDto,
  UpdateAnprCaptureDto,
} from '../../../common/dto/anpr-capture.dto';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { ParseSnowflakeIdPipe } from '../../../common/pipes/parse-snowflake-id.pipe';
import { AnprCaptureService } from './services/anpr-capture.service';

@ApiTags('Transactions / ANPR Captures')
@Controller('transactions/anpr-captures')
export class AnprCaptureController {
  constructor(private readonly anprCaptureService: AnprCaptureService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an ANPR capture record' })
  @ApiResponse({ status: 201, description: 'ANPR capture created successfully.' })
  async create(@Body() createDto: CreateAnprCaptureDto) {
    const data = await this.anprCaptureService.create(createDto);
    return { message: 'ANPR capture created successfully', data };
  }

  @Get()
  @ApiOperation({ summary: 'Retrieve ANPR captures (paginated, filterable, sortable)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['ASC', 'DESC'] })
  @ApiQuery({ name: 'filters', required: false, type: String })
  @ApiQuery({ name: 'nonPaginated', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'ANPR captures retrieved successfully.' })
  async findAll(@Query() query: PaginationQueryDto) {
    const result = await this.anprCaptureService.findAll(query);
    return { message: 'ANPR captures retrieved successfully', ...result };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Retrieve ANPR capture by ID' })
  @ApiParam({ name: 'id', type: String, description: 'ANPR capture snowflake ID' })
  @ApiResponse({ status: 200, description: 'ANPR capture retrieved successfully.' })
  async findOne(@Param('id', ParseSnowflakeIdPipe) id: string) {
    const data = await this.anprCaptureService.findOne(id);
    return { message: 'ANPR capture retrieved successfully', data };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update ANPR capture by ID' })
  @ApiParam({ name: 'id', type: String, description: 'ANPR capture snowflake ID' })
  @ApiResponse({ status: 200, description: 'ANPR capture updated successfully.' })
  async update(
    @Param('id', ParseSnowflakeIdPipe) id: string,
    @Body() updateDto: UpdateAnprCaptureDto,
  ) {
    const data = await this.anprCaptureService.update(id, updateDto);
    return { message: 'ANPR capture updated successfully', data };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete ANPR capture' })
  @ApiParam({ name: 'id', type: String, description: 'ANPR capture snowflake ID' })
  @ApiResponse({ status: 200, description: 'ANPR capture deleted successfully.' })
  async remove(@Param('id', ParseSnowflakeIdPipe) id: string) {
    await this.anprCaptureService.remove(id);
    return { message: 'ANPR capture deleted successfully', data: null };
  }
}

