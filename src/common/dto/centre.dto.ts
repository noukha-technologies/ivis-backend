import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';

export class CreateCentreDto {
  @ApiPropertyOptional({
    description: 'Unique numeric centre identifier (auto-generated if omitted)',
    example: 1001,
  })
  @IsInt({ message: 'centre_id must be a valid integer' })
  @Min(1, { message: 'centre_id must be greater than 0' })
  @IsOptional()
  centre_id?: number;

  @ApiProperty({ description: 'Centre name (alphabets only)', example: 'Muscat' })
  @IsString({ message: 'name must be a string' })
  @IsNotEmpty({ message: 'name is required' })
  @Matches(/^[A-Za-z\s'-]+$/, {
    message: 'name must contain only alphabets',
  })
  name!: string;

  @ApiProperty({ description: 'Centre unique code (alphanumeric)', example: 'CM001' })
  @IsString({ message: 'code must be a string' })
  @IsNotEmpty({ message: 'code is required' })
  @Matches(/^[A-Za-z0-9]+$/, {
    message: 'code must be alphanumeric',
  })
  code!: string;

  @ApiPropertyOptional({ description: 'Centre details description', example: 'Main hub' })
  @IsOptional()
  @IsString({ message: 'description must be a string' })
  description?: string;

  @ApiPropertyOptional({ description: 'Centre status', example: 'Active', enum: ['Active', 'Inactive'] })
  @IsString({ message: 'status must be a string' })
  @IsIn(['Active', 'Inactive'], { message: 'status must be either Active or Inactive' })
  @IsOptional()
  status?: string;

}

export class UpdateCentreDto extends PartialType(
  OmitType(CreateCentreDto, ['centre_id'] as const),
) {}
