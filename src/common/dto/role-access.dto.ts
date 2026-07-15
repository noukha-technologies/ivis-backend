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

// ── Appointments submodules ──────────────────────────────────────────────────

export class AppointmentsSubmodulesDto {
  @ApiProperty({ type: ModuleCrudFlagsDto })
  @ValidateNested()
  @Type(() => ModuleCrudFlagsDto)
  list_view!: ModuleCrudFlagsDto;

  @ApiProperty({ type: ModuleCrudFlagsDto })
  @ValidateNested()
  @Type(() => ModuleCrudFlagsDto)
  calendar_view!: ModuleCrudFlagsDto;
}

export class AppointmentsDto extends ModuleCrudFlagsDto {
  @ApiProperty({ type: AppointmentsSubmodulesDto })
  @ValidateNested()
  @Type(() => AppointmentsSubmodulesDto)
  submodules!: AppointmentsSubmodulesDto;
}

// ── Master Management submodules ─────────────────────────────────────────────

export class MasterManagementSubmodulesDto {
  @ApiProperty({ type: ModuleCrudFlagsDto })
  @ValidateNested()
  @Type(() => ModuleCrudFlagsDto)
  vehicle!: ModuleCrudFlagsDto;

  @ApiProperty({ type: ModuleCrudFlagsDto })
  @ValidateNested()
  @Type(() => ModuleCrudFlagsDto)
  center!: ModuleCrudFlagsDto;

  @ApiProperty({ type: ModuleCrudFlagsDto })
  @ValidateNested()
  @Type(() => ModuleCrudFlagsDto)
  line!: ModuleCrudFlagsDto;

  @ApiProperty({ type: ModuleCrudFlagsDto })
  @ValidateNested()
  @Type(() => ModuleCrudFlagsDto)
  admin_pc!: ModuleCrudFlagsDto;

  @ApiProperty({ type: ModuleCrudFlagsDto })
  @ValidateNested()
  @Type(() => ModuleCrudFlagsDto)
  camera_anpr!: ModuleCrudFlagsDto;

  @ApiProperty({ type: ModuleCrudFlagsDto })
  @ValidateNested()
  @Type(() => ModuleCrudFlagsDto)
  charges!: ModuleCrudFlagsDto;
}

export class MasterManagementDto extends ModuleCrudFlagsDto {
  @ApiProperty({ type: MasterManagementSubmodulesDto })
  @ValidateNested()
  @Type(() => MasterManagementSubmodulesDto)
  submodules!: MasterManagementSubmodulesDto;
}

// ── Transactions submodules ──────────────────────────────────────────────────

export class TransactionsSubmodulesDto {
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
  customers!: ModuleCrudFlagsDto;

  @ApiProperty({ type: ModuleCrudFlagsDto })
  @ValidateNested()
  @Type(() => ModuleCrudFlagsDto)
  file_processing!: ModuleCrudFlagsDto;

  @ApiProperty({ type: ModuleCrudFlagsDto })
  @ValidateNested()
  @Type(() => ModuleCrudFlagsDto)
  rop_management!: ModuleCrudFlagsDto;
}

export class TransactionsDto extends ModuleCrudFlagsDto {
  @ApiProperty({ type: TransactionsSubmodulesDto })
  @ValidateNested()
  @Type(() => TransactionsSubmodulesDto)
  submodules!: TransactionsSubmodulesDto;
}

// ── User Management submodules ───────────────────────────────────────────────

export class UserManagementSubmodulesDto {
  @ApiProperty({ type: ModuleCrudFlagsDto })
  @ValidateNested()
  @Type(() => ModuleCrudFlagsDto)
  users!: ModuleCrudFlagsDto;

  @ApiProperty({ type: ModuleCrudFlagsDto })
  @ValidateNested()
  @Type(() => ModuleCrudFlagsDto)
  roles!: ModuleCrudFlagsDto;

  @ApiProperty({ type: ModuleCrudFlagsDto })
  @ValidateNested()
  @Type(() => ModuleCrudFlagsDto)
  permissions!: ModuleCrudFlagsDto;

  @ApiProperty({ type: ModuleCrudFlagsDto })
  @ValidateNested()
  @Type(() => ModuleCrudFlagsDto)
  audit_logs!: ModuleCrudFlagsDto;
}

export class UserManagementDto extends ModuleCrudFlagsDto {
  @ApiProperty({ type: UserManagementSubmodulesDto })
  @ValidateNested()
  @Type(() => UserManagementSubmodulesDto)
  submodules!: UserManagementSubmodulesDto;
}

// ── Root matrix DTO ──────────────────────────────────────────────────────────

export class RoleAccessMatrixDto implements RoleAccessMatrix {
  @ApiProperty({ type: ModuleCrudFlagsDto })
  @ValidateNested()
  @Type(() => ModuleCrudFlagsDto)
  dashboard!: ModuleCrudFlagsDto;

  @ApiProperty({ type: AppointmentsDto })
  @ValidateNested()
  @Type(() => AppointmentsDto)
  appointments!: AppointmentsDto;

  @ApiProperty({ type: ModuleCrudFlagsDto })
  @ValidateNested()
  @Type(() => ModuleCrudFlagsDto)
  job_management!: ModuleCrudFlagsDto;

  @ApiProperty({ type: ModuleCrudFlagsDto })
  @ValidateNested()
  @Type(() => ModuleCrudFlagsDto)
  reports_analytics!: ModuleCrudFlagsDto;

  @ApiProperty({ type: ModuleCrudFlagsDto })
  @ValidateNested()
  @Type(() => ModuleCrudFlagsDto)
  configuration!: ModuleCrudFlagsDto;

  @ApiProperty({ type: MasterManagementDto })
  @ValidateNested()
  @Type(() => MasterManagementDto)
  master_management!: MasterManagementDto;

  @ApiProperty({ type: TransactionsDto })
  @ValidateNested()
  @Type(() => TransactionsDto)
  transactions!: TransactionsDto;

  @ApiProperty({ type: UserManagementDto })
  @ValidateNested()
  @Type(() => UserManagementDto)
  user_management!: UserManagementDto;
}

// ── Other DTOs ───────────────────────────────────────────────────────────────

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
    description: 'Module access matrix with submodule-level flags',
    example: Object.fromEntries(
      ROLE_ACCESS_MODULES.map((m) => [
        m,
        { create: false, edit: false, view: false },
      ]),
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
