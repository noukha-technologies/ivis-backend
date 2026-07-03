import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { PermissionProfileDto } from './permission-profile.dto';
import { ACCESS_SCOPES, AccessScope } from '../constants/access-scope';

export class CreateRoleDto {
  @ApiProperty({ example: 'Admin' })
  @IsString()
  @IsNotEmpty()
  role_name!: string;

  @ApiProperty({
    description: 'Permission profile snowflake ID (core.permissions.id)',
    example: '2058858609483202561',
  })
  @IsString()
  @IsNotEmpty()
  permission_id!: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    description:
      'Data-access scope: "global" (Super Admin, all centres) or "centre" (Centre Admin, single centre)',
    enum: ACCESS_SCOPES,
    default: 'centre',
  })
  @IsOptional()
  @IsIn(ACCESS_SCOPES)
  access_scope?: AccessScope;

  @ApiPropertyOptional({
    description:
      'Centre-admin rank — only meaningful when access_scope = "centre". true → Centre Admin, false → Centre User.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  is_center_admin?: boolean;

  @ApiPropertyOptional({
    description:
      'Owning centre snowflake id. NULL/omitted → global role. Ignored for centre-scoped actors (forced to their own centre).',
  })
  @IsOptional()
  @IsString()
  center_id?: string | null;
}

export class UpdateRoleDto extends PartialType(CreateRoleDto) {}

export class RoleDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  role_id!: number;

  @ApiProperty()
  role_name!: string;

  @ApiProperty()
  permission_id!: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty({
    enum: ACCESS_SCOPES,
    description: 'Data-access scope of the role',
  })
  access_scope!: AccessScope;

  @ApiProperty({
    description: 'Centre-admin rank (only meaningful for centre scope)',
  })
  is_center_admin!: boolean;

  @ApiPropertyOptional({
    description: 'Owning centre snowflake id (null → global role)',
  })
  center_id?: string | null;

  @ApiPropertyOptional({
    description: 'Owning centre name (null → global role)',
  })
  center_name?: string | null;

  @ApiPropertyOptional()
  created_by?: string;

  @ApiProperty()
  created_at!: Date;

  @ApiProperty()
  updated_at!: Date;

  @ApiPropertyOptional({ type: PermissionProfileDto })
  permission?: PermissionProfileDto;
}
