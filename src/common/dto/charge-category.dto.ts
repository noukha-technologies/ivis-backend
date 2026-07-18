import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';

export class CreateChargeCategoryDto {
  @ApiPropertyOptional({
    description:
      'Unique numeric charge category identifier (auto-generated if omitted)',
    example: 1,
  })
  @IsOptional()
  @IsInt({ message: 'category_id must be a valid integer' })
  @Min(1, { message: 'category_id must be greater than 0' })
  category_id?: number;

  @ApiProperty({
    description: 'Vehicle or equipment weight classification',
    example: 'Below 3 Tones',
  })
  @IsString({ message: 'vehicle_weight must be a string' })
  @IsNotEmpty({ message: 'vehicle_weight is required' })
  vehicle_weight!: string;

  @ApiPropertyOptional({
    description: 'Engine capacity or equipment type',
    example: 'Less than 1500cc',
  })
  @IsOptional()
  @IsString({ message: 'engine_capacity must be a string' })
  engine_capacity?: string;

  @ApiPropertyOptional({
    description: 'Record status',
    enum: ['Active', 'Inactive'],
    example: 'Active',
  })
  @IsOptional()
  @IsString()
  @IsIn(['Active', 'Inactive'], {
    message: 'status must be either Active or Inactive',
  })
  status?: string;
}

export class UpdateChargeCategoryDto extends PartialType(
  OmitType(CreateChargeCategoryDto, ['category_id'] as const),
) {}
