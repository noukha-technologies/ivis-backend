import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  IsIn,
} from 'class-validator';
import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';

export class CreateTestDto {
  @ApiPropertyOptional({
    description: 'Unique numeric test identifier (auto-generated if omitted)',
    example: 1001,
  })
  @IsInt({ message: 'test_id must be a valid integer' })
  @Min(1, { message: 'test_id must be greater than 0' })
  @IsOptional()
  test_id?: number;

  @ApiProperty({ description: 'Test name', example: 'Brake System' })
  @IsString({ message: 'name must be a string' })
  @IsNotEmpty({ message: 'name is required' })
  name!: string;

  @ApiProperty({ description: 'Test unique code', example: 'VT-SED' })
  @IsString({ message: 'code must be a string' })
  @IsNotEmpty({ message: 'code is required' })
  code!: string;

  @ApiPropertyOptional({
    description: 'Test status',
    example: 'Active',
    enum: ['Active', 'Inactive'],
  })
  @IsString({ message: 'status must be a string' })
  @IsIn(['Active', 'Inactive'], {
    message: 'status must be either Active or Inactive',
  })
  @IsOptional()
  status?: string;
}

export class UpdateTestDto extends PartialType(
  OmitType(CreateTestDto, ['test_id'] as const),
) {}
