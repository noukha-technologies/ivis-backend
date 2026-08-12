import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiOperation, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ErrorException } from '../../common/errors/custom-error.exception';
import { UserContext } from '../../common/dto/auth.dto';
import { ApiKeyGuard } from './guards/api-key.guard';
import { SyncCentralService } from './service/sync-central.service';
import { DatabaseSyncService } from './service/database-sync.service';
import { SyncRunLogDao } from '../database/dao/sync-run-log.dao';
import {
  SyncPushChunkDto,
  SyncPushChunkResponseDto,
  SyncPullChunkDto,
  SyncPullChunkResponseDto,
  SyncStartRunResponseDto,
  SyncRunLogDto,
} from '../../common/dto/sync.dto';

/** Same fixed, hardcoded gating as the rest of the Database Sync surface — Super Admin or Centre Admin, not the permission matrix. */
function assertCanUseSync(userContext: UserContext): void {
  const { access_scope, is_center_admin } = userContext.user;
  const isSuperAdmin = access_scope === 'global';
  const isCentreAdmin = access_scope === 'centre' && is_center_admin === true;
  if (!isSuperAdmin && !isCentreAdmin) {
    throw new ErrorException(
      'FORBIDDEN_REQUEST',
      'Not authorized to use Database Sync',
    );
  }
}

/**
 * Central-side Database Sync surface — chunked push/pull, see
 * Database_sync_arch_replan.md §3/§3a/§7. Every route here is machine-to-
 * machine: @Public() (bypasses the normal user JWT AuthGuard) but gated by
 * ApiKeyGuard instead, which resolves the bearer token to req.centreId.
 * GET /sync/runs is the one exception — that's read by the admin UI's Sync
 * Log tab under the normal user auth pipeline, not by a centre.
 */
@ApiTags('sync')
@Controller('sync')
export class SyncController {
  constructor(
    private readonly syncCentralService: SyncCentralService,
    private readonly databaseSyncService: DatabaseSyncService,
    private readonly syncRunLogDao: SyncRunLogDao,
  ) {}

  @Post('trigger')
  @ApiOperation({
    summary: 'Centre: manually trigger a Database Sync run (Sync Now button)',
  })
  @ApiOkResponse({ type: SyncRunLogDto })
  async trigger(@CurrentUser() userContext: UserContext) {
    assertCanUseSync(userContext);
    return this.databaseSyncService.runSync();
  }

  @Get('status')
  @ApiOperation({
    summary:
      "Centre: this box's own last sync run, for the Sync Log tab status line",
  })
  @ApiOkResponse({ type: SyncRunLogDto })
  async status(
    @CurrentUser() userContext: UserContext,
  ): Promise<SyncRunLogDto | null> {
    assertCanUseSync(userContext);
    const [latest] = await this.syncRunLogDao.findRecent(1);
    return latest ?? null;
  }

  @Post('run/start')
  @Public()
  @UseGuards(ApiKeyGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Central: start a new sync run, get a runId' })
  @ApiOkResponse({ type: SyncStartRunResponseDto })
  async startRun(): Promise<SyncStartRunResponseDto> {
    return this.syncCentralService.startRun();
  }

  @Post('run/push')
  @Public()
  @UseGuards(ApiKeyGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Central: accept one chunk of rows pushed from a centre',
  })
  @ApiOkResponse({ type: SyncPushChunkResponseDto })
  async pushChunk(
    @Req() req: Request,
    @Body() body: SyncPushChunkDto,
  ): Promise<SyncPushChunkResponseDto> {
    return this.syncCentralService.pushChunk(
      body.runId,
      req.centreId!,
      body.entityKey,
      body.chunkIndex,
      body.rows,
    );
  }

  @Post('run/pull')
  @Public()
  @UseGuards(ApiKeyGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Central: return the next chunk of rows for a centre to pull',
  })
  @ApiOkResponse({ type: SyncPullChunkResponseDto })
  async pullChunk(
    @Req() req: Request,
    @Body() body: SyncPullChunkDto,
  ): Promise<SyncPullChunkResponseDto> {
    return this.syncCentralService.pullChunk(
      body.runId,
      req.centreId!,
      body.entityKey,
      body.cursor,
    );
  }

  @Post('run/finish')
  @Public()
  @UseGuards(ApiKeyGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Central: mark a sync run finished (called by the centre once both phases complete)',
  })
  async finishRun(
    @Body()
    body: {
      runId: string;
      status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
      error?: string;
    },
  ): Promise<{ ok: true }> {
    await this.syncCentralService.finishRun(
      body.runId,
      body.status,
      body.error,
    );
    return { ok: true };
  }

  @Get('runs')
  @ApiOperation({ summary: 'Admin UI: recent sync run history (Sync Log tab)' })
  @ApiOkResponse({ type: [SyncRunLogDto] })
  async recentRuns(): Promise<{ message: string; data: SyncRunLogDto[] }> {
    const data = (await this.syncCentralService.recentRuns(
      20,
    )) as unknown as SyncRunLogDto[];
    return { message: 'Sync run history retrieved', data };
  }
}
