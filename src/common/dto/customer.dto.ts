import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';

export class CreateCustomerDto {
  @ApiPropertyOptional({
    description: 'Unique numeric customer identifier (auto-generated if omitted)',
    example: 1001,
  })
  @IsInt()
  @Min(1)
  @IsOptional()
  customer_id?: number;

  @ApiProperty({ description: 'Customer full name', example: 'Ahmed Al-Said' })
  @IsString()
  @IsNotEmpty()
  customer_name!: string;

  @ApiProperty({ description: 'Customer contact number', example: '+968 91000000' })
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @ApiPropertyOptional({ description: 'Alternate contact number', example: '+968 92000000' })
  @IsOptional()
  @IsString()
  alternate_phone?: string;

  @ApiPropertyOptional({ description: 'Vehicle owner name (if different from customer)', example: 'Ahmed Al-Said' })
  @IsOptional()
  @IsString()
  owner_name?: string;

  @ApiPropertyOptional({ description: 'Vehicle owner contact number', example: '+968 93000000' })
  @IsOptional()
  @IsString()
  owner_phone_number?: string;

  @ApiPropertyOptional({ description: 'National / civil ID number', example: 'ID20000000' })
  @IsOptional()
  @IsString()
  id_number?: string;

  @ApiPropertyOptional({ description: 'Vehicle chassis number', example: 'JT2BF22K0W0123456' })
  @IsOptional()
  @IsString()
  chassis_no?: string;

  @ApiPropertyOptional({ description: 'Mulkiya (vehicle registration) ID', example: 'MK-123456' })
  @IsOptional()
  @IsString()
  mulkiya_id?: string;

  @ApiPropertyOptional({ description: 'Existing vehicle record snowflake ID to link to this customer' })
  @IsOptional()
  @IsString()
  vehicle_record_id?: string;

  @ApiPropertyOptional({ description: 'Plate number — creates or links vehicle when provided', example: 'OM-1000' })
  @IsOptional()
  @IsString()
  plate_number?: string;

  @ApiPropertyOptional({ description: 'Plate colour for new or existing linked vehicle', example: 'Green' })
  @IsOptional()
  @IsString()
  plate_color?: string;
}

export class UpdateCustomerDto extends PartialType(
  OmitType(CreateCustomerDto, ['customer_id'] as const),
) {}
