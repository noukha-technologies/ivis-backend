import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';

export class CreateAnprCaptureDto {
  @ApiPropertyOptional({
    description: 'Unique numeric ANPR capture identifier (auto-generated if omitted)',
    example: 1001,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  capture_id?: number;

  @ApiProperty({ description: 'Detected plate number', example: 'OM-1024' })
  @IsString()
  @IsNotEmpty()
  plate_number!: string;

  @ApiPropertyOptional({ description: 'Normalized plate number', example: 'OM1024' })
  @IsOptional()
  @IsString()
  normalized_plate?: string;

  @ApiPropertyOptional({ description: 'Plate recognition confidence (0-100)', example: 98.4 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  plate_confidence?: number;

  @ApiProperty({
    description: 'ANPR event capture timestamp',
    example: '2026-05-05T10:32:00.000Z',
  })
  @IsDateString()
  capture_time!: string;

  @ApiProperty({ description: 'Camera snowflake ID', example: '2058858609483202561' })
  @IsString()
  @IsNotEmpty()
  camera_id!: string;

  @ApiPropertyOptional({ description: 'Lane info', example: 'Line 1' })
  @IsOptional()
  @IsString()
  lane?: string;

  @ApiPropertyOptional({ description: 'Vehicle direction', example: 'forward' })
  @IsOptional()
  @IsString()
  direction?: string;

  @ApiPropertyOptional({ description: 'Country code', example: 'OM' })
  @IsOptional()
  @IsString()
  country_code?: string;

  @ApiPropertyOptional({ description: 'Plate color', example: 'white' })
  @IsOptional()
  @IsString()
  plate_color?: string;

  @ApiPropertyOptional({ description: 'Vehicle type', example: 'car' })
  @IsOptional()
  @IsString()
  vehicle_type?: string;

  @ApiPropertyOptional({ description: 'Vehicle color', example: 'silver' })
  @IsOptional()
  @IsString()
  vehicle_color?: string;

  @ApiPropertyOptional({
    description: 'Verification status',
    example: 'Pending',
    default: 'Pending',
  })
  @IsOptional()
  @IsString()
  verification_status?: string;

  @ApiPropertyOptional({ description: 'Creator user snowflake ID', example: '2058858609483202561' })
  @ApiPropertyOptional({
    description: 'Simulate ROP fetch and upsert vehicle record after capture (demo)',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  simulate_rop?: boolean;
}

export class UpdateAnprCaptureDto extends PartialType(
  OmitType(CreateAnprCaptureDto, ['capture_id'] as const),
) {}

