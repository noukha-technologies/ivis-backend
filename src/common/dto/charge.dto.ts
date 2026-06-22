import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';

export class CreateChargeDto {
  @ApiPropertyOptional({
    description: 'Unique numeric charge identifier (auto-generated if omitted)',
    example: 1001,
  })
  @IsOptional()
  @IsInt({ message: 'charge_id must be a valid integer' })
  @Min(1, { message: 'charge_id must be greater than 0' })
  charge_id?: number;

  @ApiPropertyOptional({
    description: 'Centre snowflake ID — null means global (all centres)',
    example: '2058858609483202561',
  })
  @IsOptional()
  @IsString({ message: 'centre_id must be a string' })
  centre_id?: string;

  @ApiProperty({
    description: 'Vehicle snowflake ID',
    example: '2058858609483202562',
  })
  @IsString({ message: 'vehicle_id must be a string' })
  @IsNotEmpty({ message: 'vehicle_id is required' })
  vehicle_id!: string;

  @ApiProperty({
    description: 'Charge category (ROP weight/engine classification)',
    enum: [
      'Below3T_Lt1500cc',
      'Below3T_1500To3000cc',
      'Below3T_3000To4500cc',
      'Below3T_Above4500cc',
      'Below3T_Tractor',
      '3To5Tones',
      'Above5Tones',
    ],
    example: 'Below3T_Lt1500cc',
  })
  @IsString()
  @IsIn(
    [
      'Below3T_Lt1500cc',
      'Below3T_1500To3000cc',
      'Below3T_3000To4500cc',
      'Below3T_Above4500cc',
      'Below3T_Tractor',
      '3To5Tones',
      'Above5Tones',
    ],
    { message: 'category must be a valid ROP weight/engine classification' },
  )
  category!: string;

  @ApiProperty({ description: 'Centre charges amount (OMR)', example: 10.5 })
  @IsNumber({}, { message: 'center_charges must be a number' })
  @Min(0, { message: 'center_charges must be 0 or greater' })
  center_charges!: number;

  @ApiProperty({ description: 'ROP charges amount (OMR)', example: 5.0 })
  @IsNumber({}, { message: 'rop_charges must be a number' })
  @Min(0, { message: 'rop_charges must be 0 or greater' })
  rop_charges!: number;

  @ApiProperty({ description: 'VAT percentage (0–100)', example: 5 })
  @IsNumber({}, { message: 'vat_percent must be a number' })
  @Min(0, { message: 'vat_percent must be 0 or greater' })
  @Max(100, { message: 'vat_percent must be 100 or less' })
  vat_percent!: number;

  @ApiProperty({ description: 'Charge validity end date (ISO date)', example: '2025-12-31' })
  @IsDateString({}, { message: 'validate_to must be a valid ISO date string' })
  validate_to!: string;

  @ApiPropertyOptional({ description: 'Record status', enum: ['Active', 'Inactive'], example: 'Active' })
  @IsOptional()
  @IsString()
  @IsIn(['Active', 'Inactive'], { message: 'status must be either Active or Inactive' })
  status?: string;

  @ApiPropertyOptional({ description: 'Whether the charge is enabled', example: true })
  @IsOptional()
  @IsBoolean({ message: 'is_enabled must be a boolean' })
  is_enabled?: boolean;
}

export class UpdateChargeDto extends PartialType(
  OmitType(CreateChargeDto, ['charge_id'] as const),
) {}
