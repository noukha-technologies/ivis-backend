import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { JOB_SOURCES } from '../enums/job.enums';
import { PaymentModesEnum, PaymentStatusEnum } from '../enums/payment.enums';
import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';

export class CreatePaymentsDto {
  @ApiPropertyOptional({
    description: 'Unique numeric payment transaction identifier (auto-generated if omitted)',
    example: 1,
  })
  @IsInt()
  @Min(1)
  @IsOptional()
  payments_id?: number;

  @ApiPropertyOptional({
    description: 'Existing job snowflake ID — pre-fills customer and vehicle details',
  })
  @IsOptional()
  @IsString()
  job_id?: string;

  @ApiPropertyOptional({ description: 'Linked appointment snowflake ID' })
  @IsOptional()
  @IsString()
  appointment_id?: string;

  @ApiPropertyOptional({ description: 'Customer snowflake ID (required if job_id not provided)' })
  @IsOptional()
  @IsString()
  customer_id?: string;

  @ApiPropertyOptional({ description: 'Vehicle record snowflake ID (required if job_id not provided)' })
  @IsOptional()
  @IsString()
  vehicle_record_id?: string;

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

  @ApiProperty({ description: 'Payment type', enum: PaymentStatusEnum, example: 'Paid' })
  @IsString()
  @IsIn([...Object.values(PaymentStatusEnum)])
  payment_type!: string;

  @ApiPropertyOptional({
    description: 'Payment mode — required when payment_type is Paid',
    enum: PaymentModesEnum,
    example: 'Cash',
  })
  @IsOptional()
  @IsString()
  @IsIn([...Object.values(PaymentModesEnum)])
  payment_mode?: string;

  @ApiProperty({ description: 'Total amount including VAT (OMR)', example: 26.25 })
  @IsNumber()
  @Min(0)
  grand_total!: number;

  @ApiPropertyOptional({ description: 'Charges excluding VAT', example: 25.0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  charges?: number;

  @ApiPropertyOptional({ description: 'VAT amount', example: 1.25 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  vat?: number;

  @ApiPropertyOptional({ description: 'Payment date', example: '2026-05-28T11:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  pay_date?: string;

  @ApiPropertyOptional({
    description: 'When payment_type is Paid, automatically create a job',
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
}

export class UpdatePaymentsDto extends PartialType(OmitType(CreatePaymentsDto, ['payments_id'] as const)) { }
