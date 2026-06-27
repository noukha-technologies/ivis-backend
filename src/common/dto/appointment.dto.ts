import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { AppointmentStatus, AppointmentTypes } from '../enums/common.enums';

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

  @ApiProperty({ description: 'Customer full name (alphabets only)', example: 'Ahmed Al Said' })
  @IsString({ message: 'customer_name must be a string' })
  @IsNotEmpty({ message: 'customer_name is required' })
  @Matches(/^[A-Za-z\s'-]+$/, {
    message: 'customer_name must contain only alphabets',
  })
  customer_name!: string;

  @ApiProperty({ description: 'Customer phone (8 digits)', example: '+968 91234567' })
  @IsString({ message: 'customer_phone must be a string' })
  @IsNotEmpty({ message: 'customer_phone is required' })
  @Matches(/^(\+968\s?)?\d{8}$/, {
    message: 'customer_phone must be an 8-digit number (example: +968 91234567)',
  })
  customer_phone!: string;

  @ApiPropertyOptional({ description: 'National ID number', example: 'ID20000000' })
  @IsOptional()
  @IsString()
  id_number?: string;

  @ApiProperty({
    description: 'Vehicle VIN / chassis number (17-character alphanumeric)',
    example: 'JT2BF22K0W0123456',
  })
  @IsString({ message: 'chassis_no must be a string' })
  @IsNotEmpty({ message: 'chassis_no is required' })
  @Length(17, 17, { message: 'chassis_no must be exactly 17 characters' })
  @Matches(/^[A-Za-z0-9]{17}$/, {
    message: 'chassis_no must be a 17-character alphanumeric VIN code',
  })
  chassis_no!: string;

  @ApiPropertyOptional({
    description: 'Oman Mulkiya ID (10 digits and 1 letter)',
    example: '1234567890A',
  })
  @IsOptional()
  @Matches(/^(?=(?:.*\d){10}(?:.*[A-Za-z]){1}$)[A-Za-z0-9]{11}$/, {
    message: 'mulkiya_id must contain 10 digits and 1 letter',
  })
  mulkiya_id?: string;

  @ApiProperty({ description: 'Appointment date/time', example: '2026-05-28T10:00:00.000Z' })
  @IsDateString({}, { message: 'appointment_at must be a valid ISO date string' })
  appointment_at!: string;

  @ApiPropertyOptional({ enum: AppointmentStatus, default: 'Scheduled' })
  @IsOptional()
  @IsEnum(AppointmentStatus, { message: 'status must be a valid appointment status' })
  status?: AppointmentStatus;

  @ApiPropertyOptional({ description: 'Sync customer record from ANPR/ROP on create', default: true })
  @IsOptional()
  @IsBoolean()
  sync_customer?: boolean;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description: 'Payment mode — payment_types master snowflake ID',
    example: '2058858609483202561',
  })
  @IsOptional()
  @IsString({ message: 'payment_type_id must be a string' })
  payment_type_id?: string;

  @ApiPropertyOptional({ description: 'Appointment type', enum: AppointmentTypes, example: 'Paid' })
  @IsOptional()
  @IsEnum(AppointmentTypes, { message: 'type must be a valid appointment type' })
  type?: AppointmentTypes;

  @ApiPropertyOptional({ description: 'Payment amount', example: 150.5 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'amount must be a valid number' })
  @Min(1, { message: 'amount must be at least 1' })
  amount?: number;
}

export class UpdateAppointmentDto extends PartialType(
  OmitType(CreateAppointmentDto, ['appointment_id'] as const),
) { }
