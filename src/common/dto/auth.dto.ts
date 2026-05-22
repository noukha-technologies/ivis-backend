import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty } from 'class-validator';
import { UserSession } from '../../modules/database/entity/user-session.entity';


export class AuthUserDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  user_id!: number;

  @ApiProperty()
  user_name!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  role!: string;

  @ApiPropertyOptional()
  center?: string;

  @ApiPropertyOptional()
  line?: string;
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
