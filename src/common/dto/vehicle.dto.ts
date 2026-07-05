import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { VEHICLE_MASTER_STATUSES } from '../enums/vehicle-master.constants';
import { normalizeVehicleType } from '../utils/normalize-vehicle-type.util';

export class CreateVehicleDto {
  @ApiPropertyOptional({
    description:
      'Unique numeric vehicle master identifier (auto-generated if omitted)',
    example: 1001,
  })
  @IsInt({ message: 'vehicle id must be a valid integer' })
  @Min(1, { message: 'vehicle id must be greater than 0' })
  @IsOptional()
  vehicle_id?: number;

  @ApiProperty({
    description: 'Vehicle type name (alphabets only)',
    example: 'Tesla Sedan',
  })
  @IsString({ message: 'name must be a string' })
  @IsNotEmpty({ message: 'name is required' })
  name!: string;

  @ApiPropertyOptional({
    description:
      'Vehicle type code — auto-generated from vehicle_type + category weight (e.g. VT-SED-L). Ignored if supplied.',
    example: 'VT-SED-L',
  })
  @IsString({ message: 'code must be a string' })
  @IsOptional()
  code?: string;

  @ApiProperty({
    description: 'Vehicle type details description',
    example: 'Light sedan vehicle type',
  })
  @IsString({ message: 'description must be a string' })
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'Valid 17-character VIN (letters + digits, excluding I, O, Q)',
    example: 'JN1AZ32E90U123456',
  })
  @IsString({ message: 'vin no must be a string' })
  @IsNotEmpty({ message: 'vin no is required' })
  @Matches(/^[A-HJ-NPR-Z0-9]{17}$/i, {
    message:
      'VIN must be a valid 17-character VIN (letters and digits, no I, O, Q)',
  })
  vin_no!: string;

  @ApiProperty({
    description: 'Vehicle body type (free text, stored lowercase)',
    example: 'sedan',
  })
  @Transform(({ value }) => normalizeVehicleType(value))
  @IsString({ message: 'vehicle_type must be a string' })
  @IsNotEmpty({ message: 'vehicle_type is required' })
  vehicle_type!: string;

  @ApiProperty({
    description: 'Vehicle category — charge_categories master snowflake ID',
    example: '2058858609483202561',
  })
  @IsString({ message: 'charge_category_id must be a string' })
  @IsNotEmpty({ message: 'charge_category_id is required' })
  charge_category_id!: string;

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
) {}
