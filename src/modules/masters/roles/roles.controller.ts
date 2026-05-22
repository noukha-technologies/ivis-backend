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
import { ParseSnowflakeIdPipe } from '../../../common/pipes/parse-snowflake-id.pipe.js';
import { CreateRoleDto, UpdateRoleDto } from '../../../common/dto/role.dto.js';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import { RolesService } from './services/roles.service.js';

@ApiTags('Masters / Roles')
@Controller('masters/roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) { }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new role' })
  @ApiResponse({ status: 201, description: 'Role created successfully.' })
  @ApiResponse({ status: 400, description: 'Validation failed.' })
  @ApiResponse({ status: 409, description: 'Duplicate role name.' })
  async create(@Body() createRoleDto: CreateRoleDto) {
    const role = await this.rolesService.create(createRoleDto);
    return { message: 'Role created successfully', data: role };
  }

  @Get()
  @ApiOperation({ summary: 'Retrieve all roles (paginated)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Roles list retrieved.' })
  async findAll(@Query() query: PaginationQueryDto) {
    const result = await this.rolesService.findAll(query);
    return { message: 'Roles retrieved successfully', ...result };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Retrieve a role by ID' })
  @ApiParam({ name: 'id', type: String, description: 'Role snowflake ID' })
  @ApiResponse({ status: 200, description: 'Role retrieved successfully.' })
  @ApiResponse({ status: 404, description: 'Role not found.' })
  async findOne(@Param('id', ParseSnowflakeIdPipe) id: string) {
    const role = await this.rolesService.findOne(id);
    return { message: 'Role retrieved successfully', data: role };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update role details' })
  @ApiParam({ name: 'id', type: String, description: 'Role snowflake ID' })
  @ApiResponse({ status: 200, description: 'Role updated successfully.' })
  @ApiResponse({ status: 404, description: 'Role not found.' })
  @ApiResponse({ status: 409, description: 'Duplicate role name.' })
  async update(
    @Param('id', ParseSnowflakeIdPipe) id: string,
    @Body() updateRoleDto: UpdateRoleDto,
  ) {
    const role = await this.rolesService.update(id, updateRoleDto);
    return { message: 'Role updated successfully', data: role };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a role' })
  @ApiParam({ name: 'id', type: String, description: 'Role snowflake ID' })
  @ApiResponse({ status: 200, description: 'Role deleted successfully.' })
  @ApiResponse({ status: 404, description: 'Role not found.' })
  async remove(@Param('id', ParseSnowflakeIdPipe) id: string) {
    await this.rolesService.remove(id);
    return { message: 'Role deleted successfully', data: null };
  }
}
