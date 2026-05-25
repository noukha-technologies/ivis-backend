import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';

export class CreateVehicleDto {
  @ApiPropertyOptional({
    description: 'Unique numeric vehicle identifier (auto-generated if omitted)',
    example: 1001,
  })
  @IsInt({ message: 'vehicle_id must be a valid integer' })
  @Min(1, { message: 'vehicle_id must be greater than 0' })
  @IsOptional()
  vehicle_id?: number;

  @ApiProperty({ description: 'License plate number', example: 'ABC-1234' })
  @IsString({ message: 'plate_number must be a string' })
  @IsNotEmpty({ message: 'plate_number is required' })
  plate_number!: string;

  @ApiProperty({ description: 'Vehicle type', example: 'sedan' })
  @IsString({ message: 'vehicle_type must be a string' })
  @IsNotEmpty({ message: 'vehicle_type is required' })
  vehicle_type!: string;

  @ApiProperty({ description: 'Vehicle color', example: 'black' })
  @IsString({ message: 'vehicle_color must be a string' })
  @IsNotEmpty({ message: 'vehicle_color is required' })
  vehicle_color!: string;

  @ApiProperty({ description: 'Vehicle brand', example: 'Toyota' })
  @IsString({ message: 'vehicle_brand must be a string' })
  @IsNotEmpty({ message: 'vehicle_brand is required' })
  vehicle_brand!: string;

  @ApiPropertyOptional({ description: 'Creator user snowflake ID', example: '2058858609483202561' })
  @IsString({ message: 'created_by must be a string' })
  @IsOptional()
  created_by?: string;
}

export class UpdateVehicleDto extends PartialType(
  OmitType(CreateVehicleDto, ['vehicle_id'] as const),
) {}
