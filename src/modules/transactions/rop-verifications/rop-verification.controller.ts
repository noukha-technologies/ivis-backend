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
  CreateRopVerificationDto,
  UpdateRopVerificationDto,
} from '../../../common/dto/rop-verification.dto';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { ParseSnowflakeIdPipe } from '../../../common/pipes/parse-snowflake-id.pipe';
import { RopVerificationService } from './services/rop-verification.service';

@ApiTags('Transactions / ROP Verifications')
@Controller('transactions/rop-verifications')
export class RopVerificationController {
  constructor(private readonly ropVerificationService: RopVerificationService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a ROP verification record' })
  @ApiResponse({ status: 201, description: 'ROP verification created successfully.' })
  async create(@Body() createDto: CreateRopVerificationDto) {
    const data = await this.ropVerificationService.create(createDto);
    return { message: 'ROP verification created successfully', data };
  }

  @Get()
  @ApiOperation({
    summary: 'Retrieve ROP verifications (paginated, filterable, sortable)',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['ASC', 'DESC'] })
  @ApiQuery({ name: 'filters', required: false, type: String })
  @ApiQuery({ name: 'nonPaginated', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'ROP verifications retrieved successfully.' })
  async findAll(@Query() query: PaginationQueryDto) {
    const result = await this.ropVerificationService.findAll(query);
    return { message: 'ROP verifications retrieved successfully', ...result };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Retrieve ROP verification by ID' })
  @ApiParam({ name: 'id', type: String, description: 'ROP verification snowflake ID' })
  @ApiResponse({ status: 200, description: 'ROP verification retrieved successfully.' })
  async findOne(@Param('id', ParseSnowflakeIdPipe) id: string) {
    const data = await this.ropVerificationService.findOne(id);
    return { message: 'ROP verification retrieved successfully', data };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update ROP verification by ID' })
  @ApiParam({ name: 'id', type: String, description: 'ROP verification snowflake ID' })
  @ApiResponse({ status: 200, description: 'ROP verification updated successfully.' })
  async update(
    @Param('id', ParseSnowflakeIdPipe) id: string,
    @Body() updateDto: UpdateRopVerificationDto,
  ) {
    const data = await this.ropVerificationService.update(id, updateDto);
    return { message: 'ROP verification updated successfully', data };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete ROP verification' })
  @ApiParam({ name: 'id', type: String, description: 'ROP verification snowflake ID' })
  @ApiResponse({ status: 200, description: 'ROP verification deleted successfully.' })
  async remove(@Param('id', ParseSnowflakeIdPipe) id: string) {
    await this.ropVerificationService.remove(id);
    return { message: 'ROP verification deleted successfully', data: null };
  }
}

