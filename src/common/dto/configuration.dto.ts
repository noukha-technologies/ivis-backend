import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';
import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateConfigurationDto {
  @ApiPropertyOptional({
    description: 'Unique numeric configuration id (auto-generated if omitted)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  configuration_id?: number;

  @ApiProperty({
    description: 'Centre snowflake ID (one configuration per centre)',
  })
  @IsString()
  @IsNotEmpty({ message: 'centre_id is required' })
  centre_id!: string;

  @ApiPropertyOptional({
    description: 'Sync mode',
    enum: ['Manual', 'Automatic'],
    default: 'Manual',
  })
  @IsOptional()
  @IsIn(['Manual', 'Automatic'], {
    message: 'sync_mode must be Manual or Automatic',
  })
  sync_mode?: string;

  @ApiPropertyOptional({
    description:
      'Database Sync morning run time (Oman), HH:mm — only meaningful when sync_mode = Automatic',
    example: '06:00',
  })
  @IsOptional()
  @Matches(HHMM, { message: 'sync_time_morning must be HH:mm' })
  sync_time_morning?: string;

  @ApiPropertyOptional({
    description:
      'Database Sync evening run time (Oman), HH:mm — only meaningful when sync_mode = Automatic',
    example: '18:00',
  })
  @IsOptional()
  @Matches(HHMM, { message: 'sync_time_evening must be HH:mm' })
  sync_time_evening?: string;

  @ApiPropertyOptional({ description: 'Enable Redo Test', default: true })
  @IsOptional()
  @IsBoolean()
  redo_test_enabled?: boolean;

  @ApiPropertyOptional({
    description: 'Auto-close jobs from available OUT files',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  auto_close?: boolean;

  @ApiPropertyOptional({
    description: 'Auto-close time (Oman), HH:mm',
    example: '18:00',
  })
  @IsOptional()
  @Matches(HHMM, { message: 'auto_close_time must be HH:mm' })
  auto_close_time?: string;

  @ApiPropertyOptional({
    description: 'Payment mandatory for this centre',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  payment_mandatory?: boolean;

  @ApiPropertyOptional({
    description: 'Working hours start (Oman), HH:mm',
    example: '08:00',
  })
  @IsOptional()
  @Matches(HHMM, { message: 'working_hours_start must be HH:mm' })
  working_hours_start?: string;

  @ApiPropertyOptional({
    description: 'Working hours end (Oman), HH:mm',
    example: '18:00',
  })
  @IsOptional()
  @Matches(HHMM, { message: 'working_hours_end must be HH:mm' })
  working_hours_end?: string;

  @ApiPropertyOptional({ description: 'Status', default: 'Active' })
  @IsOptional()
  @IsString()
  status?: string;
}

export class UpdateConfigurationDto extends PartialType(
  OmitType(CreateConfigurationDto, ['centre_id', 'configuration_id'] as const),
) {}
