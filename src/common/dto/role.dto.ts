import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsArray,
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
      'Centre snowflake ids this role is linked to (role↔centre is many-to-many). Required (≥1) when access_scope = "centre"; ignored for global roles. Ignored for centre-scoped actors (forced to their own one centre).',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  center_ids?: string[];
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

  @ApiProperty({
    description:
      'Centres this role is linked to (empty → global role). For a centre-scoped viewer, redacted to at most their own centre — other linked centres are never revealed.',
    type: 'array',
    items: {
      type: 'object',
      properties: { id: { type: 'string' }, name: { type: 'string' } },
    },
  })
  centres!: { id: string; name: string }[];

  @ApiPropertyOptional()
  created_by?: string;

  @ApiProperty()
  created_at!: Date;

  @ApiProperty()
  updated_at!: Date;

  @ApiPropertyOptional({ type: PermissionProfileDto })
  permission?: PermissionProfileDto;
}
