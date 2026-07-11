import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { Public } from '../../common/decorators/public.decorator';
import { OnboardingCentralService } from './service/onboarding-central.service';
import {
  VerifyCentralRequestDto,
  VerifyCentralResponseDto,
  ResolveReScopedRowRequestDto,
  ResolveReScopedRowResponseDto,
  OnboardingConfirmRequestDto,
  OnboardingConfirmResponseDto,
  OnboardingPullStartRequestDto,
  OnboardingPullStartResponseDto,
  OnboardingPullChunkRequestDto,
  OnboardingPullChunkResponseDto,
  OnboardingPullByIdsRequestDto,
  OnboardingPullByIdsResponseDto,
  OnboardingPullCompleteRequestDto,
  OnboardingPullCompleteResponseDto,
} from '../../common/dto/onboarding.dto';

/**
 * Central-side Onboarding Sync HTTPS surface — see
 * Database_sync_arch_replan.md §5. All routes @Public() (no user JWT, no
 * API key yet — that's the whole point, a centre has neither before this
 * completes). Authenticated by the centre user's own login credentials
 * (checked once at /confirm, then a short-lived pullToken/pullSessionId
 * carries authorization through the chunked pull calls that follow).
 */
@ApiTags('onboarding')
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboardingCentral: OnboardingCentralService) {}

  @Post('verify-central')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Central: password check only (NOT the pull handshake) — used by Super Admin auth flows' })
  @ApiOkResponse({ type: VerifyCentralResponseDto })
  async verifyCentral(@Body() body: VerifyCentralRequestDto): Promise<VerifyCentralResponseDto> {
    return this.onboardingCentral.verifyCentral(body.email, body.password);
  }

  @Post('resolve-rescoped-row')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Central: on-demand re-scope row for a Super Admin logging into an already-onboarded centre' })
  @ApiOkResponse({ type: ResolveReScopedRowResponseDto })
  async resolveReScopedRow(
    @Body() body: ResolveReScopedRowRequestDto,
  ): Promise<ResolveReScopedRowResponseDto> {
    const row = await this.onboardingCentral.resolveReScopedRow(body.email, body.centreId);
    return { row };
  }

  @Post('confirm')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Central: verify a centre user\'s credentials, return centre info + pullToken' })
  @ApiOkResponse({ type: OnboardingConfirmResponseDto })
  async confirm(@Body() body: OnboardingConfirmRequestDto): Promise<OnboardingConfirmResponseDto> {
    return this.onboardingCentral.confirm(body.email, body.password);
  }

  @Post('pull/start')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Central: exchange a pullToken for a pullSessionId' })
  @ApiOkResponse({ type: OnboardingPullStartResponseDto })
  async pullStart(@Body() body: OnboardingPullStartRequestDto): Promise<OnboardingPullStartResponseDto> {
    return this.onboardingCentral.pullStart(body.pullToken, body.selectedSuperAdminIds);
  }

  @Post('pull/chunk')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Central: return the next chunk of one entity for this centre\'s initial pull' })
  @ApiOkResponse({ type: OnboardingPullChunkResponseDto })
  async pullChunk(@Body() body: OnboardingPullChunkRequestDto): Promise<OnboardingPullChunkResponseDto> {
    return this.onboardingCentral.pullChunk(body.pullSessionId, body.entityKey, body.cursor);
  }

  @Post('pull/by-ids')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Central: fetch specific rows by id (cross-centre FK top-up, no centre-scoping)' })
  @ApiOkResponse({ type: OnboardingPullByIdsResponseDto })
  async pullByIds(@Body() body: OnboardingPullByIdsRequestDto): Promise<OnboardingPullByIdsResponseDto> {
    const rows = await this.onboardingCentral.pullByIds(body.pullSessionId, body.entityKey, body.ids);
    return { rows };
  }

  @Post('pull/complete')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Central: finish the pull session, mint + return this centre\'s API key' })
  @ApiOkResponse({ type: OnboardingPullCompleteResponseDto })
  async pullComplete(
    @Body() body: OnboardingPullCompleteRequestDto,
  ): Promise<OnboardingPullCompleteResponseDto> {
    return this.onboardingCentral.pullComplete(body.pullSessionId);
  }
}
