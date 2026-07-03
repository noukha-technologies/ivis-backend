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
  CreateChargeCategoryDto,
  UpdateChargeCategoryDto,
} from '../../../common/dto/charge-category.dto';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { ChargeCategoryService } from './service/charge-category.service';

@ApiTags('Masters / Charge Categories')
@Controller('masters/charge-categories')
export class ChargeCategoryController {
  constructor(private readonly chargeCategoryService: ChargeCategoryService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new charge category' })
  @ApiResponse({
    status: 201,
    description: 'Charge category created successfully.',
  })
  @ApiResponse({ status: 400, description: 'Validation failed.' })
  async create(
    @CurrentUser() actor: UserContext,
    @Body() dto: CreateChargeCategoryDto,
  ) {
    const category = await this.chargeCategoryService.create(dto, actor);
    return { message: 'Charge category created successfully', data: category };
  }

  @Get()
  @ApiOperation({
    summary: 'Retrieve all charge categories (paginated, filterable, sortable)',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['ASC', 'DESC'] })
  @ApiQuery({ name: 'nonPaginated', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Charge categories retrieved.' })
  async findAll(@Query() query: PaginationQueryDto) {
    const result = await this.chargeCategoryService.findAll(query);
    return { message: 'Charge categories retrieved successfully', ...result };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Retrieve a charge category by snowflake ID' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({
    status: 200,
    description: 'Charge category retrieved successfully.',
  })
  @ApiResponse({ status: 404, description: 'Charge category not found.' })
  async findOne(@Param('id', ParseSnowflakeIdPipe) id: string) {
    const category = await this.chargeCategoryService.findOne(id);
    return {
      message: 'Charge category retrieved successfully',
      data: category,
    };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a charge category' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({
    status: 200,
    description: 'Charge category updated successfully.',
  })
  @ApiResponse({ status: 404, description: 'Charge category not found.' })
  async update(
    @Param('id', ParseSnowflakeIdPipe) id: string,
    @Body() dto: UpdateChargeCategoryDto,
  ) {
    const category = await this.chargeCategoryService.update(id, dto);
    return { message: 'Charge category updated successfully', data: category };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a charge category' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({
    status: 200,
    description: 'Charge category deleted successfully.',
  })
  @ApiResponse({ status: 404, description: 'Charge category not found.' })
  async remove(@Param('id', ParseSnowflakeIdPipe) id: string) {
    await this.chargeCategoryService.remove(id);
    return { message: 'Charge category deleted successfully', data: null };
  }
}
