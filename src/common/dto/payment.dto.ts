import { IsInt, IsNotEmpty, IsOptional, IsString, Min, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';

export class CreatePaymentDto {
  @ApiPropertyOptional({
    description: 'Unique numeric identifier (auto-generated if omitted)',
    example: 7001,
  })
  @IsInt({ message: 'payment_id must be a valid integer' })
  @Min(1, { message: 'payment_id must be greater than 0' })
  @IsOptional()
  payment_id?: number;

  @ApiProperty({ description: 'Payment Mode Name', example: 'Cash' })
  @IsString({ message: 'name must be a string' })
  @IsNotEmpty({ message: 'name is required' })
  name!: string;

  @ApiProperty({ description: 'Unique payment code', example: 'PM-CSH' })
  @IsString({ message: 'code must be a string' })
  @IsNotEmpty({ message: 'code is required' })
  code!: string;

  @ApiPropertyOptional({ description: 'Payment status', example: 'Active', enum: ['Active', 'Inactive'] })
  @IsString({ message: 'status must be a string' })
  @IsIn(['Active', 'Inactive'], { message: 'status must be either Active or Inactive' })
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ description: 'Creator user snowflake ID', example: '2058858609483202561' })
  @IsString({ message: 'created_by must be a string' })
  @IsOptional()
  created_by?: string;
}

export class UpdatePaymentDto extends PartialType(
  OmitType(CreatePaymentDto, ['payment_id'] as const),
) {}
