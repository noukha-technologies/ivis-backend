import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { UserSession } from '../../modules/database/entity/user-session.entity';
import { ACCESS_SCOPES, AccessScope } from '../constants/access-scope';

export class AuthUserDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  user_id!: number;

  @ApiProperty({
    description: 'Unique alphanumeric user code',
    example: 'USR1001',
  })
  user_code!: string;

  @ApiProperty()
  user_name!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  role!: string;

  @ApiProperty({ description: 'Role snowflake ID (core.roles.id)' })
  role_id!: string;

  @ApiProperty({
    description: 'Deprecated alias for role_id (backward compatibility)',
    deprecated: true,
  })
  role_access_id!: string;

  @ApiProperty({
    description:
      'Role data-access scope: "global" (all centres) or "centre" (single centre)',
    enum: ACCESS_SCOPES,
  })
  access_scope!: AccessScope;

  @ApiProperty({
    description:
      'Whether the role is a Centre Admin (only meaningful for centre scope)',
  })
  is_center_admin!: boolean;

  @ApiPropertyOptional({ description: 'Centre display name' })
  center?: string;

  @ApiPropertyOptional({
    description: 'Primary line display name (first assigned line)',
  })
  line?: string;

  @ApiPropertyOptional({ description: 'Centre snowflake ID' })
  center_id?: string;

  @ApiPropertyOptional({
    description: 'Assigned line snowflake IDs',
    type: [String],
  })
  line_ids?: string[];

  @ApiPropertyOptional({
    description: 'Assigned line summaries',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        line_id: { type: 'number' },
        name: { type: 'string' },
        code: { type: 'string' },
      },
    },
  })
  lines?: { id: string; line_id: number; name: string; code: string }[];
}

export class LoginRequestDto {
  @ApiProperty({ example: 'john.doe@example.com' })
  @IsNotEmpty()
  @Transform(({ value }) => value?.trim().toLowerCase())
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'P@ssw0rd123' })
  @IsNotEmpty()
  @Transform(({ value }) => value?.trim())
  password!: string;

  @ApiPropertyOptional({
    description:
      'Second step of the Onboarding Sync confirmation handshake — resend the same login request with this set to true after receiving a CONFIRMATION_REQUIRED response to actually run the centre-scoped data sync.',
  })
  @IsOptional()
  @IsBoolean()
  confirmOnboarding?: boolean;

  @ApiPropertyOptional({
    description:
      'IDs (from CONFIRMATION_REQUIRED.centre.availableSuperAdmins) of the central Super Admin accounts to re-scope into this centre as part of setup. Only meaningful alongside confirmOnboarding=true. Omit or send empty to grant no Super Admin access at setup time.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectedSuperAdminIds?: string[];
}

export class OnboardingSuperAdminOptionDto {
  @ApiProperty({ description: 'Central Super Admin user snowflake ID' })
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  user_name!: string;
}

export class OnboardingCentreInfoDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty({
    description:
      'Whether this centre already has an is_center_admin role centrally — Super Admin selection is only offered when true.',
  })
  centreAdminRoleExists!: boolean;

  @ApiProperty({
    description:
      'Central Super Admin accounts eligible to be re-scoped into this centre at setup time. Empty if centreAdminRoleExists is false or no Super Admin accounts exist centrally.',
    type: [OnboardingSuperAdminOptionDto],
  })
  availableSuperAdmins!: OnboardingSuperAdminOptionDto[];
}

export class RefreshTokenRequestDto {
  @ApiProperty({ description: 'Refresh token issued at login' })
  @IsNotEmpty()
  @Transform(({ value }) => value?.trim())
  refreshToken!: string;
}

export const LOGIN_RESPONSE_STATUSES = [
  'SUCCESS',
  'CONFIRMATION_REQUIRED',
  'ONBOARDING_IN_PROGRESS',
] as const;

export type LoginResponseStatus = (typeof LOGIN_RESPONSE_STATUSES)[number];

export class LoginResponseDto {
  @ApiProperty({
    enum: LOGIN_RESPONSE_STATUSES,
    default: 'SUCCESS',
    description:
      'Discriminates the login outcome. Everything except a genuine auth ' +
      'failure returns HTTP 200 — CONFIRMATION_REQUIRED and ' +
      'ONBOARDING_IN_PROGRESS are not errors, they carry no tokens and the ' +
      'client must react to this field, not the HTTP status alone.',
  })
  status!: LoginResponseStatus;

  @ApiPropertyOptional({
    description: 'Present only when status is CONFIRMATION_REQUIRED.',
    type: OnboardingCentreInfoDto,
  })
  centre?: OnboardingCentreInfoDto;

  @ApiPropertyOptional()
  accessToken?: string;

  @ApiPropertyOptional()
  refreshToken?: string;

  @ApiPropertyOptional()
  expiresAt?: Date;

  @ApiPropertyOptional()
  user?: AuthUserDto;

  @ApiPropertyOptional({
    description:
      'Flat permission keys resolved from role → permission.access (guard vocabulary)',
    type: [String],
  })
  permissions!: string[];

  @ApiProperty({
    description: 'Status of the login flow',
    example: 'SUCCESS',
    required: false,
  })
  status?: string;
}

export class BootstrapAdminDto {
  @ApiProperty({
    example: 'admin@ivis.local',
    description: 'Admin login email',
  })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({
    example: 'Admin@12345',
    minLength: 8,
    description: 'Admin password',
  })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiPropertyOptional({ example: 'System Admin', default: 'System Admin' })
  @IsOptional()
  @IsString()
  user_name?: string;

  @ApiPropertyOptional({
    example: 'ADMIN',
    default: 'ADMIN',
    description: 'Unique alphanumeric user code',
  })
  @IsOptional()
  @IsString()
  user_code?: string;

  @ApiPropertyOptional({
    example: 'admin',
    default: 'admin',
    description: 'Role name to create/grant full access to',
  })
  @IsOptional()
  @IsString()
  role_name?: string;
}

export class BootstrapAdminResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  user_id!: number;

  @ApiProperty()
  user_code!: string;

  @ApiProperty()
  user_name!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  role_name!: string;

  @ApiProperty({ description: 'Role snowflake ID (core.roles.id)' })
  role_id!: string;

  @ApiProperty({
    description: 'Deprecated alias for role_id (backward compatibility)',
    deprecated: true,
  })
  role_access_id!: string;

  @ApiProperty({
    description: 'All flat permission keys granted to the admin',
    type: [String],
  })
  permissions!: string[];
}

export type UserContext = {
  user: AuthUserDto;
  session: UserSession;
  resolvedPermissions: string[];
};

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessJti: string;
  refreshJti: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
}
