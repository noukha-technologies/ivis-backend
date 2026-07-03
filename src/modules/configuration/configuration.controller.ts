import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PermissionKeys } from '../../common/constants/permissions';
import { ParseSnowflakeIdPipe } from '../../common/pipes/parse-snowflake-id.pipe';
import type { UserContext } from '../../common/dto/auth.dto';
import {
  CreateConfigurationDto,
  UpdateConfigurationDto,
} from '../../common/dto/configuration.dto';
import { ConfigurationService } from './services/configuration.service';

@ApiTags('Configuration')
@Controller('configuration')
export class ConfigurationController {
  constructor(private readonly configurationService: ConfigurationService) {}

  @Get(':centreId')
  @Permissions(PermissionKeys.CONFIGURATION_VIEW)
  @ApiOperation({ summary: 'Get the configuration for a centre' })
  @ApiParam({ name: 'centreId', type: String })
  async getByCentre(@Param('centreId', ParseSnowflakeIdPipe) centreId: string) {
    const data = await this.configurationService.getByCentre(centreId);
    return { message: 'Configuration retrieved successfully', data };
  }

  @Put()
  @Permissions(PermissionKeys.CONFIGURATION_UPSERT)
  @ApiOperation({ summary: 'Create or update a centre configuration' })
  async upsert(@CurrentUser() actor: UserContext, @Body() dto: CreateConfigurationDto) {
    const data = await this.configurationService.upsert(dto, actor);
    return { message: 'Configuration saved successfully', data };
  }

  @Put(':centreId')
  @Permissions(PermissionKeys.CONFIGURATION_UPSERT)
  @ApiOperation({ summary: 'Update a centre configuration by centre id' })
  @ApiParam({ name: 'centreId', type: String })
  async updateByCentre(
    @CurrentUser() actor: UserContext,
    @Param('centreId', ParseSnowflakeIdPipe) centreId: string,
    @Body() dto: UpdateConfigurationDto,
  ) {
    const data = await this.configurationService.updateByCentre(centreId, dto, actor);
    return { message: 'Configuration saved successfully', data };
  }
}
