import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { APPOINTMENT_STATUSES } from '../enums/appointment.enums';

export class CreateAppointmentDto {
  @ApiPropertyOptional({
    description: 'Unique numeric appointment identifier (auto-generated if omitted)',
    example: 1,
  })
  @IsInt()
  @Min(1)
  @IsOptional()
  appointment_id?: number;

  @ApiPropertyOptional({ description: 'Linked ANPR capture snowflake ID' })
  @IsOptional()
  @IsString()
  anpr_capture_id?: string;

  @ApiPropertyOptional({ description: 'Existing customer snowflake ID' })
  @IsOptional()
  @IsString()
  customer_id?: string;

  @ApiPropertyOptional({ description: 'Existing vehicle record snowflake ID' })
  @IsOptional()
  @IsString()
  vehicle_record_id?: string;

  @ApiPropertyOptional({ description: 'Centre snowflake ID' })
  @IsOptional()
  @IsString()
  centre_id?: string;

  @ApiPropertyOptional({ description: 'Line snowflake ID' })
  @IsOptional()
  @IsString()
  line_id?: string;

  @ApiPropertyOptional({ description: 'Plate number', example: 'OM-1000' })
  @IsOptional()
  @IsString()
  plate_number?: string;

  @ApiProperty({ description: 'Customer full name', example: 'Ahmed Al-Said' })
  @IsString()
  @IsNotEmpty()
  customer_name!: string;

  @ApiProperty({ description: 'Customer phone', example: '+96891000000' })
  @IsString()
  @IsNotEmpty()
  customer_phone!: string;

  @ApiPropertyOptional({ description: 'National ID number', example: 'ID20000000' })
  @IsOptional()
  @IsString()
  id_number?: string;

  @ApiProperty({ description: 'Appointment date/time', example: '2026-05-28T10:00:00.000Z' })
  @IsDateString()
  appointment_at!: string;

  @ApiPropertyOptional({ enum: APPOINTMENT_STATUSES, default: 'Scheduled' })
  @IsOptional()
  @IsString()
  @IsIn([...APPOINTMENT_STATUSES])
  status?: (typeof APPOINTMENT_STATUSES)[number];

  @ApiPropertyOptional({ description: 'Sync customer record from ANPR/ROP on create', default: true })
  @IsOptional()
  @IsBoolean()
  sync_customer?: boolean;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Creator user snowflake ID' })
  @IsOptional()
  @IsString()
  created_by?: string;
}

export class UpdateAppointmentDto extends PartialType(
  OmitType(CreateAppointmentDto, ['appointment_id'] as const),
) {}
