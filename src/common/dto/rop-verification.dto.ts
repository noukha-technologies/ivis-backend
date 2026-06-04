import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';

export class CreateRopVerificationDto {
  @ApiPropertyOptional({
    description: 'Unique numeric ROP verification identifier (auto-generated if omitted)',
    example: 1001,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  rop_verification_id?: number;

  @ApiProperty({ description: 'ANPR capture snowflake ID', example: '2058858609483202561' })
  @IsString()
  @IsNotEmpty()
  anpr_capture_id!: string;

  @ApiPropertyOptional({ description: 'Vehicle owner name', example: 'Ahmed Al Balushi' })
  @IsOptional()
  @IsString()
  owner_name?: string;

  @ApiPropertyOptional({ description: 'Vehicle make', example: 'Toyota' })
  @IsOptional()
  @IsString()
  vehicle_make?: string;

  @ApiPropertyOptional({ description: 'Vehicle model', example: 'Corolla' })
  @IsOptional()
  @IsString()
  vehicle_model?: string;

  @ApiPropertyOptional({ description: 'Registration number', example: 'OM-1024' })
  @IsOptional()
  @IsString()
  reg_no?: string;

  @ApiPropertyOptional({ description: 'Chassis number', example: 'JTDBR32E720067894' })
  @IsOptional()
  @IsString()
  chassis_no?: string;

  @ApiPropertyOptional({ description: 'Insurance details', example: 'Valid until 2026-12-31' })
  @IsOptional()
  @IsString()
  insurance?: string;

  @ApiPropertyOptional({ description: 'Registration expiry date', example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  reg_expiry?: string;

  @ApiPropertyOptional({
    description: 'ROP fetch status',
    example: 'Not Fetched',
    default: 'Not Fetched',
  })
  @IsOptional()
  @IsString()
  fetch_status?: string;
}

export class UpdateRopVerificationDto extends PartialType(
  OmitType(CreateRopVerificationDto, ['rop_verification_id', 'anpr_capture_id'] as const),
) {}

