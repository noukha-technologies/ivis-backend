import { Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ErrorException } from '../../common/errors/custom-error.exception';
import { isGlobalScope } from '../../common/constants/access-scope';
import type { UserContext } from '../../common/dto/auth.dto';
import { SyncStatusDto, SyncTriggerResponseDto } from '../../common/dto/sync.dto';
import { SyncStateDao } from '../database/dao/sync-state.dao';
import { DatabaseSyncService } from './service/database-sync.service';

@ApiTags('Database Sync')
@Controller('sync')
export class SyncController {
  constructor(
    private readonly databaseSyncService: DatabaseSyncService,
    private readonly syncStateDao: SyncStateDao,
  ) {}

  /**
   * Database Sync is deliberately NOT gated by the Configuration module's
   * create/edit permission matrix (SYNC_TRIGGER/SYNC_VIEW) — a role's
   * Configuration checkboxes must never hide/show this. Fixed to Super Admin
   * and Center Admin only, matching the frontend's canUseSync in
   * ConfigurationPage.tsx.
   */
  private assertCanUseSync(actor: UserContext): void {
    const canUse =
      isGlobalScope(actor.user.access_scope) ||
      (actor.user.access_scope === 'centre' && actor.user.is_center_admin === true);
    if (!canUse) {
      throw new ErrorException(
        'FORBIDDEN_REQUEST',
        'Only a Super Admin or Center Admin can use Database Sync.',
      );
    }
  }

  @Post('trigger')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manually trigger Database Sync (pull + push, synchronous)' })
  @ApiBearerAuth('jwt')
  @ApiOkResponse({ type: SyncTriggerResponseDto })
  async trigger(@CurrentUser() actor: UserContext) {
    this.assertCanUseSync(actor);
    const result = await this.databaseSyncService.runSync();
    return { message: 'Database Sync complete', data: result };
  }

  @Get('status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Current Database Sync cursors/status for this centre' })
  @ApiBearerAuth('jwt')
  @ApiOkResponse({ type: SyncStatusDto })
  async status(@CurrentUser() actor: UserContext) {
    this.assertCanUseSync(actor);
    const state = await this.syncStateDao.ensureSingletonRow();
    return {
      message: 'Sync status retrieved successfully',
      data: {
        last_pulled_at: state.last_pulled_at ?? null,
        last_pushed_at: state.last_pushed_at ?? null,
        last_sync_status: state.last_sync_status ?? null,
        last_error: state.last_error ?? null,
      },
    };
  }
}
