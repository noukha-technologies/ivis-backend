import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import type { RoleAccessMatrix } from '../types/role-access.types';
import { RoleAccessMatrixDto } from './role-access.dto';

export class CreatePermissionProfileDto {
  @ApiProperty({ example: 'Admin Access' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ example: 'Full administrative access profile' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ type: RoleAccessMatrixDto })
  @IsObject()
  @ValidateNested()
  @Type(() => RoleAccessMatrixDto)
  access!: RoleAccessMatrixDto;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}

export class UpdatePermissionProfileDto extends PartialType(
  CreatePermissionProfileDto,
) {}

export class PermissionProfileDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty()
  access!: RoleAccessMatrix;

  @ApiProperty()
  is_active!: boolean;

  @ApiPropertyOptional()
  created_by?: string;

  @ApiProperty()
  created_at!: Date;

  @ApiProperty()
  updated_at!: Date;
}
