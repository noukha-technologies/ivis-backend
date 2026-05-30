import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { PermissionKeys } from '../../common/constants/permissions';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PermissionDto, UpsertPermissionDto } from '../../common/dto/permissions.dto';
import { PermissionService } from './service/permission.service';

@ApiTags('Permissions')
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissionService: PermissionService) {}

  @Get()
  @Permissions(PermissionKeys.PERMISSIONS_VIEW)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all permissions' })
  @ApiBearerAuth('jwt')
  @ApiQuery({
    name: 'includeInActive',
    type: Boolean,
    required: false,
    description: 'Include inactive permissions',
  })
  @ApiOkResponse({ description: 'Permission list', type: [PermissionDto] })
  getAllPermissions(@Query('includeInActive') includeInActive = false) {
    return this.permissionService.getAllPermissions(includeInActive);
  }

  @Post()
  @Permissions(PermissionKeys.PERMISSIONS_UPSERT)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create or update a permission by key' })
  @ApiBearerAuth('jwt')
  @ApiCreatedResponse({ description: 'Permission saved', type: PermissionDto })
  upsertPermission(@Body() body: UpsertPermissionDto) {
    return this.permissionService.savePermission(body);
  }
}
