import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

/**
 * Machine-to-machine wire protocol between a centre (client) and central
 * (server) for Onboarding Sync's HTTPS bootstrap — see
 * Database_sync_arch_replan.md §5. Distinct from auth.dto.ts's
 * LoginRequestDto/OnboardingCentreInfoDto, which are the CENTRE'S OWN
 * frontend-facing login contract and are unchanged by this migration.
 */

/** Lightweight password check — NOT the onboarding pull handshake. See onboarding-central.service.ts's verifyCentral. */
export class VerifyCentralRequestDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  password!: string;
}

export class VerifyCentralResponseDto {
  @ApiProperty()
  valid!: boolean;

  @ApiPropertyOptional()
  userId?: string;

  @ApiPropertyOptional()
  accessScope?: string;

  @ApiPropertyOptional()
  isGlobalScope?: boolean;
}

/**
 * Re-issue a centre's Database Sync credential, authenticated by user
 * credentials rather than an API key.
 *
 * The credential is normally issued once, at the end of the onboarding pull.
 * If that write is lost — central reachable but the local UPDATE failed, the
 * box restored from a backup taken before it, the centre onboarded on a build
 * that discarded the value — the centre is stranded: onboarding short-circuits
 * at COMPLETED and never re-runs, and every authenticated route into central
 * needs the very key that is missing.
 *
 * Password auth is the only channel that does not require the missing key,
 * which is what makes recovery possible at all.
 */
export class IssueSyncKeyRequestDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  password!: string;
}

export class IssueSyncKeyResponseDto {
  @ApiProperty({ description: 'Plaintext key. Returned once, never stored.' })
  apiKey!: string;

  @ApiProperty()
  centreId!: string;

  @ApiProperty({ description: 'Prior active keys revoked by this issue.' })
  revokedCount!: number;
}

/** On-demand re-scope — a Super Admin logging into an already-onboarded centre for the first time. */
export class ResolveReScopedRowRequestDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  centreId!: string;
}

export class ResolveReScopedRowResponseDto {
  @ApiProperty({ type: 'object', additionalProperties: true })
  row!: Record<string, unknown>;
}

export class OnboardingConfirmRequestDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  password!: string;
}

export class OnboardingSuperAdminCandidateDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  user_name!: string;
}

export class OnboardingConfirmResponseDto {
  @ApiProperty({ enum: ['CONFIRMATION_REQUIRED'] })
  status!: 'CONFIRMATION_REQUIRED';

  @ApiProperty()
  centreId!: string;

  @ApiProperty()
  centreName!: string;

  @ApiProperty()
  centreCode!: string;

  @ApiProperty({
    description: 'Availability of an is_center_admin role centrally.',
  })
  centreAdminRoleExists!: boolean;

  @ApiProperty({
    type: [OnboardingSuperAdminCandidateDto],
    description:
      'Central Super Admin accounts eligible for re-scoping into this centre.',
  })
  availableSuperAdmins!: OnboardingSuperAdminCandidateDto[];

  @ApiProperty({
    description:
      'Short-lived token authorizing the subsequent /onboarding/pull/* calls for this centre.',
  })
  pullToken!: string;
}

export class OnboardingPullStartRequestDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  pullToken!: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectedSuperAdminIds?: string[];
}

export class OnboardingPullStartResponseDto {
  @ApiProperty()
  pullSessionId!: string;
}

export class OnboardingPullChunkRequestDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  pullSessionId!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  entityKey!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string;
}

export class OnboardingPullChunkResponseDto {
  @ApiProperty({ type: 'array', items: { type: 'object' } })
  rows!: Record<string, unknown>[];

  @ApiProperty()
  hasMore!: boolean;

  @ApiPropertyOptional()
  nextCursor?: string | null;
}

/** Cross-centre FK top-up — fetch specific rows by id, no centre-scoping. See onboarding-central.service.ts's pullByIds. */
export class OnboardingPullByIdsRequestDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  pullSessionId!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  entityKey!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  ids!: string[];
}

export class OnboardingPullByIdsResponseDto {
  @ApiProperty({ type: 'array', items: { type: 'object' } })
  rows!: Record<string, unknown>[];
}

export class OnboardingPullCompleteRequestDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  pullSessionId!: string;
}

export class OnboardingPullCompleteResponseDto {
  @ApiProperty({
    description:
      'Plaintext API key — returned exactly once, never stored anywhere in plaintext.',
  })
  apiKey!: string;

  @ApiProperty({
    type: 'array',
    items: { type: 'object' },
    description:
      'Re-scoped User rows for any selected Super Admins — same PK as the real central account, ' +
      "pointed at this centre's own centre-admin role, requires_central_revalidation: true. The " +
      'centre writes these locally alongside its normal User pull chunk.',
  })
  reScopedSuperAdmins!: Record<string, unknown>[];
}
