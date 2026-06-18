import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { VEHICLE_MASTER_STATUSES } from '../enums/vehicle-master.constants';

export class CreateVehicleDto {
  @ApiPropertyOptional({
    description: 'Unique numeric vehicle master identifier (auto-generated if omitted)',
    example: 1001,
  })
  @IsInt({ message: 'vehicle id must be a valid integer' })
  @Min(1, { message: 'vehicle id must be greater than 0' })
  @IsOptional()
  vehicle_id?: number;

  @ApiProperty({ description: 'Vehicle type name (alphabets only)', example: 'Tesla Sedan' })
  @IsString({ message: 'name must be a string' })
  @IsNotEmpty({ message: 'name is required' })
  name!: string;

  @ApiProperty({ description: 'Unique vehicle type code (alphanumeric)', example: 'VTSEDAN01' })
  @IsString({ message: 'code must be a string' })
  @IsNotEmpty({ message: 'code is required' })
  code!: string;

  @ApiProperty({
    description: 'Unique 17-character alphanumeric VIN number',
    example: 'JN1AZ32E90U123456',
  })
  @IsString({ message: 'vin no must be a string' })
  @IsNotEmpty({ message: 'vin no is required' })
  vin_no!: string;

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
