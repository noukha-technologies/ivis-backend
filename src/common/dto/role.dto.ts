import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { PermissionProfileDto } from './permission-profile.dto';

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
}

export class UpdateRoleDto extends PartialType(CreateRoleDto) { }

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


  @ApiPropertyOptional()
  created_by?: string;

  @ApiProperty()
  created_at!: Date;

  @ApiProperty()
  updated_at!: Date;

  @ApiPropertyOptional({ type: PermissionProfileDto })
  permission?: PermissionProfileDto;
}
