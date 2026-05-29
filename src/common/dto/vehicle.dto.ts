import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';

export class CreateVehicleDto {
  @ApiPropertyOptional({
    description: 'Unique numeric vehicle master identifier (auto-generated if omitted)',
    example: 1001,
  })
  @IsInt({ message: 'vehicle_id must be a valid integer' })
  @Min(1, { message: 'vehicle_id must be greater than 0' })
  @IsOptional()
  vehicle_id?: number;

  @ApiProperty({ description: 'Vehicle type name', example: 'Sedan Light' })
  @IsString({ message: 'name must be a string' })
  @IsNotEmpty({ message: 'name is required' })
  name!: string;

  @ApiProperty({ description: 'Unique vehicle type code', example: 'VT-SED-LIGHT' })
  @IsString({ message: 'code must be a string' })
  @IsNotEmpty({ message: 'code is required' })
  code!: string;

  @ApiPropertyOptional({ description: 'Reference VIN number', example: 'JN1AZ32E90U123456' })
  @IsString({ message: 'vin_no must be a string' })
  @IsOptional()
  vin_no?: string;

  @ApiPropertyOptional({
    description: 'Vehicle type description',
    example: 'Light vehicle category for sedan inspections',
  })
  @IsString({ message: 'description must be a string' })
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    description: 'Vehicle master status',
    example: 'Active',
    enum: ['Active', 'Inactive'],
  })
  @IsString({ message: 'status must be a string' })
  @IsIn(['Active', 'Inactive'], { message: 'status must be either Active or Inactive' })
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ description: 'Creator user snowflake ID', example: '2058858609483202561' })
  @IsString({ message: 'created_by must be a string' })
  @IsOptional()
  created_by?: string;
}

export class UpdateVehicleDto extends PartialType(
  OmitType(CreateVehicleDto, ['vehicle_id'] as const),
) {}
