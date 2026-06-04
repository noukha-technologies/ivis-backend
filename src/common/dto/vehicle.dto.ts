import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { VEHICLE_MASTER_STATUSES } from '../enums/vehicle-master.constants';

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
    description: 'Vehicle master status',
    example: 'Active',
    enum: VEHICLE_MASTER_STATUSES,
  })
  @IsString({ message: 'status must be a string' })
  @IsIn(VEHICLE_MASTER_STATUSES, {
    message: 'status must be Active, Inactive, or Suspended',
  })
  @IsOptional()
  status?: string;

}

export class UpdateVehicleDto extends PartialType(
  OmitType(CreateVehicleDto, ['vehicle_id'] as const),
) { }
