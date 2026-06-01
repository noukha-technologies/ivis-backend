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
import {
  CreateRoleAccessDto,
  RoleAccessDto,
  UpdateRoleAccessDto,
} from '../../common/dto/role-access.dto';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { ParseSnowflakeIdPipe } from '../../common/pipes/parse-snowflake-id.pipe';
import { PermissionService } from './service/permission.service';
import { Public } from 'src/common/decorators/public.decorator';

@ApiTags('Permissions')
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissionService: PermissionService) { }

  @Get('keys')
  @Permissions(PermissionKeys.PERMISSIONS_VIEW)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List all API permission keys (guard vocabulary)' })
  @ApiBearerAuth('jwt')
  @ApiOkResponse({ description: 'Flat permission key list' })
  listPermissionKeys() {
    return {
      message: 'Permission keys retrieved successfully',
      data: this.permissionService.listPermissionKeys(),
    };
  }

  @Public()
  @Post()
  @Permissions(PermissionKeys.PERMISSIONS_UPSERT)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create role with access matrix' })
  @ApiBearerAuth('jwt')
  @ApiCreatedResponse({ description: 'Role access created', type: RoleAccessDto })
  create(@Body() body: CreateRoleAccessDto) {
    return this.permissionService.create(body).then((data) => ({
      message: 'Role access created successfully',
      data,
    }));
  }

  @Get()
  @Permissions(PermissionKeys.PERMISSIONS_VIEW)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List roles with access matrix (paginated)' })
  @ApiBearerAuth('jwt')
  @ApiOkResponse({ description: 'Role access list' })
  findAll(@Query() query: PaginationQueryDto) {
    return this.permissionService.findAll(query).then((result) => ({
      message: 'Role access list retrieved successfully',
      ...result,
    }));
  }

  @Get('by-name/:roleName')
  @Permissions(PermissionKeys.PERMISSIONS_VIEW)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get role access by role name' })
  @ApiParam({ name: 'roleName', type: String })
  @ApiBearerAuth('jwt')
  findByRoleName(@Param('roleName') roleName: string) {
    return this.permissionService.findByRoleName(roleName).then((data) => ({
      message: 'Role access retrieved successfully',
      data,
    }));
  }

  @Get(':id')
  @Permissions(PermissionKeys.PERMISSIONS_VIEW)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get role access by id' })
  @ApiParam({ name: 'id', type: String })
  @ApiBearerAuth('jwt')
  findOne(@Param('id', ParseSnowflakeIdPipe) id: string) {
    return this.permissionService.findOne(id).then((data) => ({
      message: 'Role access retrieved successfully',
      data,
    }));
  }

  @Patch(':id')
  @Permissions(PermissionKeys.PERMISSIONS_UPSERT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update role name and/or access matrix' })
  @ApiParam({ name: 'id', type: String })
  @ApiBearerAuth('jwt')
  update(
    @Param('id', ParseSnowflakeIdPipe) id: string,
    @Body() body: UpdateRoleAccessDto,
  ) {
    return this.permissionService.update(id, body).then((data) => ({
      message: 'Role access updated successfully',
      data,
    }));
  }

  @Delete(':id')
  @Permissions(PermissionKeys.PERMISSIONS_DELETE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete role access' })
  @ApiParam({ name: 'id', type: String })
  @ApiBearerAuth('jwt')
  async remove(@Param('id', ParseSnowflakeIdPipe) id: string) {
    await this.permissionService.remove(id);
    return { message: 'Role access deleted successfully', data: null };
  }
}
