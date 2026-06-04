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
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { PermissionKeys } from '../../common/constants/permissions';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CreateRoleDto, RoleDto, UpdateRoleDto } from '../../common/dto/role.dto';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { ParseSnowflakeIdPipe } from '../../common/pipes/parse-snowflake-id.pipe';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { UserContext } from '../../common/dto/auth.dto';
import { RolesService } from './service/roles.service';

@ApiTags('Roles')
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) { }

  @Post()
  @Permissions(PermissionKeys.ROLES_UPSERT)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create role (requires existing permission_id)' })
  @ApiBearerAuth('jwt')
  @ApiCreatedResponse({ description: 'Role created', type: RoleDto })
  create(@CurrentUser() actor: UserContext, @Body() body: CreateRoleDto) {
    return this.rolesService.create(body, actor).then((data) => ({
      message: 'Role created successfully',
      data,
    }));
  }

  @Get()
  @Permissions(PermissionKeys.ROLES_VIEW)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List roles (paginated)' })
  @ApiBearerAuth('jwt')
  findAll(@Query() query: PaginationQueryDto) {
    return this.rolesService.findAll(query).then((result) => ({
      message: 'Roles retrieved successfully',
      ...result,
    }));
  }

  @Get('by-name/:roleName')
  @Permissions(PermissionKeys.ROLES_VIEW)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get role by name' })
  @ApiParam({ name: 'roleName', type: String })
  @ApiBearerAuth('jwt')
  findByRoleName(@Param('roleName') roleName: string) {
    return this.rolesService.findByRoleName(roleName).then((data) => ({
      message: 'Role retrieved successfully',
      data,
    }));
  }

  @Get(':id')
  @Permissions(PermissionKeys.ROLES_VIEW)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get role by id' })
  @ApiParam({ name: 'id', type: String })
  @ApiBearerAuth('jwt')
  findOne(@Param('id', ParseSnowflakeIdPipe) id: string) {
    return this.rolesService.findOne(id).then((data) => ({
      message: 'Role retrieved successfully',
      data,
    }));
  }

  @Patch(':id')
  @Permissions(PermissionKeys.ROLES_UPSERT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update role' })
  @ApiParam({ name: 'id', type: String })
  @ApiBearerAuth('jwt')
  update(
    @Param('id', ParseSnowflakeIdPipe) id: string,
    @Body() body: UpdateRoleDto,
  ) {
    return this.rolesService.update(id, body).then((data) => ({
      message: 'Role updated successfully',
      data,
    }));
  }

  @Delete(':id')
  @Permissions(PermissionKeys.ROLES_DELETE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete role' })
  @ApiParam({ name: 'id', type: String })
  @ApiBearerAuth('jwt')
  async remove(@Param('id', ParseSnowflakeIdPipe) id: string) {
    await this.rolesService.remove(id);
    return { message: 'Role deleted successfully', data: null };
  }
}
