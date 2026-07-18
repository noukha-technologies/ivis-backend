import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { PermissionKeys } from '../../common/constants/permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import type { UserContext } from '../../common/dto/auth.dto';
import {
  DashboardOverviewQueryDto,
  DashboardOverviewResponseDto,
} from '../../common/dto/dashboard.dto';
import { DashboardService } from './services/dashboard.service';

@ApiTags('Dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('overview')
  @Permissions(PermissionKeys.DASHBOARD_VIEW)
  @ApiOperation({
    summary: 'Dashboard operational overview for a centre',
  })
  @ApiResponse({
    status: 200,
    description: 'Overview metrics returned successfully.',
    type: DashboardOverviewResponseDto,
  })
  async getOverview(
    @CurrentUser() actor: UserContext,
    @Query() query: DashboardOverviewQueryDto,
  ) {
    const data = await this.dashboardService.getOverview(
      actor,
      query.centre_id,
    );
    return { message: 'Dashboard overview retrieved successfully', data };
  }
}
