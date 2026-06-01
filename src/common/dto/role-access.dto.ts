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
import type { RoleAccessMatrix, RoleAccessModule } from '../types/role-access.types';
import { ROLE_ACCESS_MODULES } from '../types/role-access.types';

export class ModuleCrudFlagsDto {
  @ApiProperty()
  @IsBoolean()
  create!: boolean;

  @ApiProperty()
  @IsBoolean()
  edit!: boolean;

  @ApiProperty()
  @IsBoolean()
  view!: boolean;
}

export class RoleAccessMatrixDto implements RoleAccessMatrix {
  @ApiProperty({ type: ModuleCrudFlagsDto })
  @ValidateNested()
  @Type(() => ModuleCrudFlagsDto)
  job_management!: ModuleCrudFlagsDto;

  @ApiProperty({ type: ModuleCrudFlagsDto })
  @ValidateNested()
  @Type(() => ModuleCrudFlagsDto)
  vehicle_customer!: ModuleCrudFlagsDto;

  @ApiProperty({ type: ModuleCrudFlagsDto })
  @ValidateNested()
  @Type(() => ModuleCrudFlagsDto)
  appointments!: ModuleCrudFlagsDto;

  @ApiProperty({ type: ModuleCrudFlagsDto })
  @ValidateNested()
  @Type(() => ModuleCrudFlagsDto)
  payments!: ModuleCrudFlagsDto;

  @ApiProperty({ type: ModuleCrudFlagsDto })
  @ValidateNested()
  @Type(() => ModuleCrudFlagsDto)
  vehicle_records!: ModuleCrudFlagsDto;

  @ApiProperty({ type: ModuleCrudFlagsDto })
  @ValidateNested()
  @Type(() => ModuleCrudFlagsDto)
  file_processing!: ModuleCrudFlagsDto;

  @ApiProperty({ type: ModuleCrudFlagsDto })
  @ValidateNested()
  @Type(() => ModuleCrudFlagsDto)
  rop_integration!: ModuleCrudFlagsDto;

  @ApiProperty({ type: ModuleCrudFlagsDto })
  @ValidateNested()
  @Type(() => ModuleCrudFlagsDto)
  user_roles!: ModuleCrudFlagsDto;

  @ApiProperty({ type: ModuleCrudFlagsDto })
  @ValidateNested()
  @Type(() => ModuleCrudFlagsDto)
  reports_analytics!: ModuleCrudFlagsDto;
}

export class CreateRoleAccessDto {
  @ApiProperty({ example: 'Receptionist' })
  @IsString()
  @IsNotEmpty()
  role_name!: string;

  @ApiProperty({ type: RoleAccessMatrixDto })
  @IsObject()
  @ValidateNested()
  @Type(() => RoleAccessMatrixDto)
  access!: RoleAccessMatrixDto;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  created_by?: string;
}

export class UpdateRoleAccessDto extends PartialType(CreateRoleAccessDto) {}

export class RoleAccessDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  role_name!: string;

  @ApiProperty({
    description: 'Module access matrix',
    example: Object.fromEntries(
      ROLE_ACCESS_MODULES.map((m) => [m, { create: false, edit: false, view: false }]),
    ),
  })
  access!: RoleAccessMatrix;

  @ApiPropertyOptional()
  created_by?: string;

  @ApiProperty()
  created_at!: Date;

  @ApiProperty()
  updated_at!: Date;
}
