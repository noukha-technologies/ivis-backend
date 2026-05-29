import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { PAYMENT_TRANSACTION_STATUSES } from '../enums/payment-transaction.enums';
import { JOB_SOURCES } from '../enums/job.enums';

export class CreatePaymentTransactionDto {
  @ApiPropertyOptional({
    description: 'Unique numeric payment transaction identifier (auto-generated if omitted)',
    example: 1,
  })
  @IsInt()
  @Min(1)
  @IsOptional()
  payment_transaction_id?: number;

  @ApiPropertyOptional({ description: 'Linked appointment snowflake ID' })
  @IsOptional()
  @IsString()
  appointment_id?: string;

  @ApiProperty({ description: 'Customer snowflake ID' })
  @IsString()
  @IsNotEmpty()
  customer_id!: string;

  @ApiProperty({ description: 'Vehicle record snowflake ID' })
  @IsString()
  @IsNotEmpty()
  vehicle_record_id!: string;

  @ApiPropertyOptional({ description: 'ANPR capture snowflake ID' })
  @IsOptional()
  @IsString()
  anpr_capture_id?: string;

  @ApiPropertyOptional({ description: 'Centre snowflake ID' })
  @IsOptional()
  @IsString()
  centre_id?: string;

  @ApiPropertyOptional({ description: 'Line snowflake ID' })
  @IsOptional()
  @IsString()
  line_id?: string;

  @ApiPropertyOptional({ description: 'Admin PC snowflake ID' })
  @IsOptional()
  @IsString()
  admin_pc_id?: string;

  @ApiPropertyOptional({ description: 'Camera snowflake ID' })
  @IsOptional()
  @IsString()
  camera_id?: string;

  @ApiProperty({ description: 'Payment type', example: 'Mix' })
  @IsString()
  @IsNotEmpty()
  payment_type!: string;

  @ApiPropertyOptional({ enum: PAYMENT_TRANSACTION_STATUSES, default: 'Pending' })
  @IsOptional()
  @IsString()
  @IsIn([...PAYMENT_TRANSACTION_STATUSES])
  status?: (typeof PAYMENT_TRANSACTION_STATUSES)[number];

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  charges?: number;

  @ApiPropertyOptional({ example: 1.5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  vat?: number;

  @ApiPropertyOptional({ example: 31.5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  grand_total?: number;

  @ApiPropertyOptional({ description: 'Payment date', example: '2026-05-28T11:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  pay_date?: string;

  @ApiPropertyOptional({
    description: 'When status is Paid, automatically create a job',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  auto_create_job?: boolean;

  @ApiPropertyOptional({ description: 'Job source when auto-creating', enum: JOB_SOURCES })
  @IsOptional()
  @IsString()
  @IsIn([...JOB_SOURCES])
  job_source?: (typeof JOB_SOURCES)[number];

  @ApiPropertyOptional({ description: 'Creator user snowflake ID' })
  @IsOptional()
  @IsString()
  created_by?: string;
}

export class UpdatePaymentTransactionDto extends PartialType(
  OmitType(CreatePaymentTransactionDto, ['payment_transaction_id'] as const),
) {}
