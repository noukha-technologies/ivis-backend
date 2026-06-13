import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min, IsIn } from 'class-validator';
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

  @ApiProperty({ description: 'Customer snowflake ID', example: '1234567890123456789' })
  @IsString({ message: 'customer_id must be a string' })
  @IsNotEmpty({ message: 'customer_id is required' })
  customer_id!: string;

  @ApiProperty({ description: 'Unique payment code', example: 'PM-CSH' })
  @IsString({ message: 'code must be a string' })
  @IsNotEmpty({ message: 'code is required' })
  code!: string;

  @ApiPropertyOptional({ description: 'Payment status', example: 'Active', enum: ['Active', 'Inactive'] })
  @IsString({ message: 'status must be a string' })
  @IsIn(['Active', 'Inactive'], { message: 'status must be either Active or Inactive' })
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ description: 'Payment Mode', example: 'Cash' })
  @IsString({ message: 'payment_mode must be a string' })
  @IsOptional()
  payment_mode?: string;

  @ApiPropertyOptional({ description: 'Payment Type', example: 'Paid' })
  @IsString({ message: 'type must be a string' })
  @IsOptional()
  type?: string;

  @ApiProperty({ description: 'Payment amount', example: 150.5 })
  @IsNumber({}, { message: 'amount must be a number' })
  @Min(0, { message: 'amount must be greater than or equal to 0' })
  amount!: number;
}

export class UpdatePaymentDto extends PartialType(
  OmitType(CreatePaymentDto, ['payment_id'] as const),
) {}
