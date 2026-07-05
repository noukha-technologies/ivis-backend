import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
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
}

export class RefreshTokenRequestDto {
  @ApiProperty({ description: 'Refresh token issued at login' })
  @IsNotEmpty()
  @Transform(({ value }) => value?.trim())
  refreshToken!: string;
}

export class LoginResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  refreshToken!: string;

  @ApiProperty()
  expiresAt!: Date;

  @ApiProperty()
  user!: AuthUserDto;

  @ApiProperty({
    description:
      'Flat permission keys resolved from role → permission.access (guard vocabulary)',
    type: [String],
  })
  permissions!: string[];
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
