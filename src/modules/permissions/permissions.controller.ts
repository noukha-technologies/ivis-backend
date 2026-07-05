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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseSnowflakeIdPipe } from '../../common/pipes/parse-snowflake-id.pipe';

import type { UserContext } from '../../common/dto/auth.dto';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import {
  CreatePermissionProfileDto,
  PermissionProfileDto,
  UpdatePermissionProfileDto,
} from '../../common/dto/permission-profile.dto';

import { PermissionService } from './service/permissions.service';
import { Public } from 'src/common/decorators/public.decorator';

@ApiTags('Permissions')
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissionProfileService: PermissionService) {}

  @Get('keys')
  @Permissions(PermissionKeys.PERMISSIONS_VIEW)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List all API permission keys (guard vocabulary)' })
  @ApiBearerAuth('jwt')
  @ApiOkResponse({ description: 'Flat permission key list' })
  listPermissionKeys() {
    return {
      message: 'Permission keys retrieved successfully',
      data: this.permissionProfileService.listPermissionKeys(),
    };
  }

  @Public()
  @Post()
  @Permissions(PermissionKeys.PERMISSIONS_UPSERT)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create permission access profile (create before role)',
  })
  @ApiBearerAuth('jwt')
  @ApiCreatedResponse({
    description: 'Permission profile created',
    type: PermissionProfileDto,
  })
  create(
    @CurrentUser() actor: UserContext,
    @Body() body: CreatePermissionProfileDto,
  ) {
    return this.permissionProfileService.create(body, actor).then((data) => ({
      message: 'Permission profile created successfully',
      data,
    }));
  }

  @Get()
  @Permissions(PermissionKeys.PERMISSIONS_VIEW)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List permission access profiles (paginated)' })
  @ApiBearerAuth('jwt')
  findAll(@Query() query: PaginationQueryDto) {
    return this.permissionProfileService.findAll(query).then((result) => ({
      message: 'Permission profiles retrieved successfully',
      ...result,
    }));
  }

  @Get(':id')
  @Permissions(PermissionKeys.PERMISSIONS_VIEW)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get permission access profile by id' })
  @ApiParam({ name: 'id', type: String })
  @ApiBearerAuth('jwt')
  findOne(@Param('id', ParseSnowflakeIdPipe) id: string) {
    return this.permissionProfileService.findOne(id).then((data) => ({
      message: 'Permission profile retrieved successfully',
      data,
    }));
  }

  @Public()
  @Patch(':id')
  @Permissions(PermissionKeys.PERMISSIONS_UPSERT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update permission access profile (invalidates affected sessions)',
  })
  @ApiParam({ name: 'id', type: String })
  @ApiBearerAuth('jwt')
  update(
    @Param('id', ParseSnowflakeIdPipe) id: string,
    @Body() body: UpdatePermissionProfileDto,
  ) {
    return this.permissionProfileService.update(id, body).then((data) => ({
      message: 'Permission profile updated successfully',
      data,
    }));
  }

  @Delete(':id')
  @Permissions(PermissionKeys.PERMISSIONS_DELETE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete permission access profile' })
  @ApiParam({ name: 'id', type: String })
  @ApiBearerAuth('jwt')
  async remove(@Param('id', ParseSnowflakeIdPipe) id: string) {
    await this.permissionProfileService.remove(id);
    return { message: 'Permission profile deleted successfully', data: null };
  }
}
