import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';

export class CreatePaymentTypeDto {
  @ApiPropertyOptional({
    description: 'Unique numeric payment type identifier (auto-generated if omitted)',
    example: 1,
  })
  @IsOptional()
  @IsInt({ message: 'payment_type_id must be a valid integer' })
  @Min(1, { message: 'payment_type_id must be greater than 0' })
  payment_type_id?: number;

  @ApiProperty({ description: 'Payment type name', example: 'Cash' })
  @IsString({ message: 'name must be a string' })
  @IsNotEmpty({ message: 'name is required' })
  name!: string;

  @ApiProperty({ description: 'Unique payment type code', example: 'CASH' })
  @IsString({ message: 'code must be a string' })
  @IsNotEmpty({ message: 'code is required' })
  code!: string;

  @ApiPropertyOptional({ description: 'Record status', enum: ['Active', 'Inactive'], example: 'Active' })
  @IsOptional()
  @IsString()
  @IsIn(['Active', 'Inactive'], { message: 'status must be either Active or Inactive' })
  status?: string;
}

export class UpdatePaymentTypeDto extends PartialType(
  OmitType(CreatePaymentTypeDto, ['payment_type_id'] as const),
) {}
