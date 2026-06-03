import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty } from 'class-validator';
import { UserSession } from '../../modules/database/entity/user-session.entity';


export class AuthUserDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  user_id!: number;

  @ApiProperty({ description: 'Unique alphanumeric user code', example: 'USR1001' })
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

  @ApiPropertyOptional({ description: 'Centre display name' })
  center?: string;

  @ApiPropertyOptional({ description: 'Primary line display name (first assigned line)' })
  line?: string;

  @ApiPropertyOptional({ description: 'Centre snowflake ID' })
  center_id?: string;

  @ApiPropertyOptional({ description: 'Assigned line snowflake IDs', type: [String] })
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
    description: 'Flat permission keys resolved from role → permission.access (guard vocabulary)',
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
