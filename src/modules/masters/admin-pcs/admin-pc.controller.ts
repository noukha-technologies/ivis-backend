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
import { CreateAdminPcDto, UpdateAdminPcDto } from '../../../common/dto/admin-pc.dto';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { AdminPcService } from './services/admin-pc.service';

@ApiTags('Masters / Admin PCs')
@Controller('masters/admin-pcs')
export class AdminPcController {
  constructor(private readonly adminPcService: AdminPcService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new Admin PC' })
  @ApiResponse({ status: 201, description: 'Admin PC created successfully.' })
  @ApiResponse({ status: 400, description: 'Validation failed.' })
  @ApiResponse({ status: 409, description: 'Duplicate code or admin_pc_id.' })
  async create(
    @CurrentUser() actor: UserContext,
    @Body() createAdminPcDto: CreateAdminPcDto,
  ) {
    const pc = await this.adminPcService.create(createAdminPcDto, actor);
    return { message: 'Admin PC created successfully', data: pc };
  }

  @Get()
  @ApiOperation({ summary: 'Retrieve all Admin PCs (paginated, filterable, sortable)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'name, code, ip_address',
  })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['ASC', 'DESC'] })
  @ApiResponse({ status: 200, description: 'Admin PCs list retrieved.' })
  async findAll(@Query() query: PaginationQueryDto) {
    const result = await this.adminPcService.findAll(query);
    return { message: 'Admin PCs retrieved successfully', ...result };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Retrieve an Admin PC by ID' })
  @ApiParam({ name: 'id', type: String, description: 'Admin PC snowflake ID' })
  @ApiResponse({ status: 200, description: 'Admin PC retrieved successfully.' })
  @ApiResponse({ status: 404, description: 'Admin PC not found.' })
  async findOne(@Param('id', ParseSnowflakeIdPipe) id: string) {
    const pc = await this.adminPcService.findOne(id);
    return { message: 'Admin PC retrieved successfully', data: pc };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update Admin PC details' })
  @ApiParam({ name: 'id', type: String, description: 'Admin PC snowflake ID' })
  @ApiResponse({ status: 200, description: 'Admin PC updated successfully.' })
  @ApiResponse({ status: 404, description: 'Admin PC not found.' })
  @ApiResponse({ status: 409, description: 'Duplicate code.' })
  async update(
    @Param('id', ParseSnowflakeIdPipe) id: string,
    @Body() updateAdminPcDto: UpdateAdminPcDto,
  ) {
    const pc = await this.adminPcService.update(id, updateAdminPcDto);
    return { message: 'Admin PC updated successfully', data: pc };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete an Admin PC' })
  @ApiParam({ name: 'id', type: String, description: 'Admin PC snowflake ID' })
  @ApiResponse({ status: 200, description: 'Admin PC deleted successfully.' })
  @ApiResponse({ status: 404, description: 'Admin PC not found.' })
  async remove(@Param('id', ParseSnowflakeIdPipe) id: string) {
    await this.adminPcService.remove(id);
    return { message: 'Admin PC deleted successfully', data: null };
  }
}
