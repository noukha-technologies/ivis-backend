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
import {
  CreateChargeDto,
  UpdateChargeDto,
} from '../../../common/dto/charge.dto';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { ChargeService } from './services/charge.service';

@ApiTags('Masters / Charges')
@Controller('masters/charges')
export class ChargeController {
  constructor(private readonly chargeService: ChargeService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new charge record' })
  @ApiResponse({ status: 201, description: 'Charge created successfully.' })
  @ApiResponse({ status: 400, description: 'Validation failed.' })
  @ApiResponse({ status: 404, description: 'Centre or vehicle not found.' })
  @ApiResponse({
    status: 409,
    description: 'Duplicate centre/vehicle/category combination.',
  })
  async create(
    @CurrentUser() actor: UserContext,
    @Body() dto: CreateChargeDto,
  ) {
    const charge = await this.chargeService.create(dto, actor);
    return { message: 'Charge created successfully', data: charge };
  }

  @Get()
  @ApiOperation({
    summary: 'Retrieve all charges (paginated, filterable, sortable)',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'category, status',
  })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['ASC', 'DESC'] })
  @ApiQuery({ name: 'nonPaginated', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Charges list retrieved.' })
  async findAll(@Query() query: PaginationQueryDto) {
    const result = await this.chargeService.findAll(query);
    return { message: 'Charges retrieved successfully', ...result };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Retrieve a charge by snowflake ID' })
  @ApiParam({ name: 'id', type: String, description: 'Charge snowflake ID' })
  @ApiResponse({ status: 200, description: 'Charge retrieved successfully.' })
  @ApiResponse({ status: 404, description: 'Charge not found.' })
  async findOne(@Param('id', ParseSnowflakeIdPipe) id: string) {
    const charge = await this.chargeService.findOne(id);
    return { message: 'Charge retrieved successfully', data: charge };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a charge record' })
  @ApiParam({ name: 'id', type: String, description: 'Charge snowflake ID' })
  @ApiResponse({ status: 200, description: 'Charge updated successfully.' })
  @ApiResponse({ status: 404, description: 'Charge not found.' })
  @ApiResponse({
    status: 409,
    description: 'Duplicate centre/vehicle/category combination.',
  })
  async update(
    @Param('id', ParseSnowflakeIdPipe) id: string,
    @Body() dto: UpdateChargeDto,
  ) {
    const charge = await this.chargeService.update(id, dto);
    return { message: 'Charge updated successfully', data: charge };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a charge record' })
  @ApiParam({ name: 'id', type: String, description: 'Charge snowflake ID' })
  @ApiResponse({ status: 200, description: 'Charge deleted successfully.' })
  @ApiResponse({ status: 404, description: 'Charge not found.' })
  async remove(@Param('id', ParseSnowflakeIdPipe) id: string) {
    await this.chargeService.remove(id);
    return { message: 'Charge deleted successfully', data: null };
  }
}
