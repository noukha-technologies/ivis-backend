import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  Validate,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  JOB_OVERALL_RESULTS,
  JOB_PAYMENT_TYPES,
  JOB_SOURCES,
  JOB_STATUSES,
  JOB_TYPES,
} from '../enums/job.enums';
import type { JobType } from '../enums/job.enums';
import {
  CreateJobRequestConstraint,
  isLegacyJobCreate,
} from '../validators/job-create-request.validator.js';

export class JobPaymentDto {
  @ApiPropertyOptional({
    description: 'Payment amount in OMR (required when type is Paid)',
    example: 3432,
  })
  @ValidateIf((dto: JobPaymentDto) => dto.type === 'Paid')
  @IsNumber()
  @Min(1)
  amount?: number;

  @ApiProperty({
    description: 'Payment type',
    enum: JOB_PAYMENT_TYPES,
    example: 'Paid',
  })
  @IsString()
  @IsIn([...JOB_PAYMENT_TYPES])
  type!: (typeof JOB_PAYMENT_TYPES)[number];

  @ApiProperty({
    description: 'Payment mode (payment_types master value)',
    example: 'Card',
  })
  @IsString()
  @IsNotEmpty()
  mode!: string;

  @ApiPropertyOptional({
    description: 'Capture image as base64 data URL or external URL',
  })
  @IsOptional()
  @IsString()
  capture_image?: string;

  @ApiPropertyOptional({
    description: 'Attachment as base64 data URL or external URL',
  })
  @IsOptional()
  @IsString()
  attachment?: string;

  @ApiPropertyOptional({
    description: 'Original attachment filename',
    example: 'receipt.pdf',
  })
  @IsOptional()
  @IsString()
  attachment_filename?: string;
}

export class CreateJobIntakeDto {
  @ApiProperty({ description: 'Customer full name', example: 'Ahmed Al-Said' })
  @IsString()
  @IsNotEmpty()
  customer_name!: string;

  @ApiProperty({
    description: 'Customer contact number',
    example: '+968 91234567',
  })
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @ApiPropertyOptional({
    description: 'Mulkiya (vehicle registration) ID',
    example: '34343432',
  })
  @IsOptional()
  @IsString()
  mulkiya_id?: string;

  @ApiProperty({
    description: 'Vehicle plate number',
    example: '4141413411114',
  })
  @IsString()
  @IsNotEmpty()
  vehicle_no!: string;

  @ApiPropertyOptional({
    description: 'Vehicle VIN / chassis number',
    example: '4134331413',
  })
  @IsOptional()
  @IsString()
  vin_no?: string;

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

  @ApiPropertyOptional({
    description: 'Job source',
    example: 'Walk-In',
    enum: JOB_SOURCES,
    default: 'Walk-In',
  })
  @IsOptional()
  @IsString()
  @IsIn([...JOB_SOURCES])
  source?: (typeof JOB_SOURCES)[number];

  @ApiProperty({ description: 'Payment details' })
  @ValidateNested()
  @Type(() => JobPaymentDto)
  payment!: JobPaymentDto;
}

export class CreateJobRequestDto {
  @Validate(CreateJobRequestConstraint)
  @IsOptional()
  _createJobRequest?: boolean;

  @ApiPropertyOptional({
    description:
      'Legacy: unique numeric job identifier (auto-generated if omitted)',
    example: 1,
  })
  @ValidateIf((dto: CreateJobRequestDto) => isLegacyJobCreate(dto))
  @IsInt()
  @Min(1)
  @IsOptional()
  job_id?: number;

  @ApiPropertyOptional({
    description: 'Legacy: job status',
    enum: JOB_STATUSES,
  })
  @ValidateIf((dto: CreateJobRequestDto) => isLegacyJobCreate(dto))
  @IsString()
  @IsIn([...JOB_STATUSES])
  @IsOptional()
  status?: (typeof JOB_STATUSES)[number];

  @ApiPropertyOptional({
    description: 'Legacy: existing customer snowflake ID',
  })
  @ValidateIf((dto: CreateJobRequestDto) => isLegacyJobCreate(dto))
  @IsString()
  @IsNotEmpty()
  customer_id?: string;

  @ApiPropertyOptional({
    description: 'Legacy: existing vehicle record snowflake ID',
  })
  @ValidateIf((dto: CreateJobRequestDto) => isLegacyJobCreate(dto))
  @IsString()
  @IsNotEmpty()
  vehicle_record_id?: string;

  @ApiPropertyOptional({ description: 'ANPR capture snowflake ID' })
  @IsOptional()
  @IsString()
  anpr_capture_id?: string;

  @ApiPropertyOptional({
    description: 'Customer full name',
    example: 'Ahmed Al-Said',
  })
  @ValidateIf((dto: CreateJobRequestDto) => !isLegacyJobCreate(dto))
  @IsString()
  @IsNotEmpty()
  customer_name?: string;

  @ApiPropertyOptional({
    description: 'Customer contact number',
    example: '+968 91234567',
  })
  @ValidateIf((dto: CreateJobRequestDto) => !isLegacyJobCreate(dto))
  @IsString()
  @IsNotEmpty()
  phone?: string;

  @ApiPropertyOptional({
    description: 'Mulkiya (vehicle registration) ID',
    example: '34343432',
  })
  @IsOptional()
  @IsString()
  mulkiya_id?: string;

  @ApiPropertyOptional({
    description: 'Vehicle plate number',
    example: '4141413411114',
  })
  @ValidateIf((dto: CreateJobRequestDto) => !isLegacyJobCreate(dto))
  @IsString()
  @IsNotEmpty()
  vehicle_no?: string;

  @ApiPropertyOptional({
    description: 'Vehicle VIN / chassis number',
    example: '4134331413',
  })
  @IsOptional()
  @IsString()
  vin_no?: string;

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

  @ApiPropertyOptional({
    description: 'Job source',
    example: 'Walk-In',
    enum: JOB_SOURCES,
    default: 'Walk-In',
  })
  @IsOptional()
  @IsString()
  @IsIn([...JOB_SOURCES])
  source?: (typeof JOB_SOURCES)[number];

  @ApiPropertyOptional({ description: 'Payment details' })
  @ValidateIf((dto: CreateJobRequestDto) => !isLegacyJobCreate(dto))
  @ValidateNested()
  @Type(() => JobPaymentDto)
  payment?: JobPaymentDto;
}

export class CreateJobDto {
  @ApiPropertyOptional({
    description: 'Unique numeric job identifier (auto-generated if omitted)',
    example: 1,
  })
  @IsInt()
  @Min(1)
  @IsOptional()
  job_id?: number;

  @ApiPropertyOptional({
    description: 'Appointment snowflake ID this job was converted from',
  })
  @IsOptional()
  @IsString()
  appointment_id?: string;

  @ApiPropertyOptional({
    description: 'Job status',
    example: 'Pending',
    enum: JOB_STATUSES,
    default: 'Pending',
  })
  @IsString()
  @IsIn([...JOB_STATUSES])
  @IsOptional()
  status?: (typeof JOB_STATUSES)[number];

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

  @ApiPropertyOptional({
    description:
      'First inspection or return visit. Resolved from the vehicle history on conversion; only set directly for a manual job.',
    enum: JOB_TYPES,
  })
  @IsOptional()
  @IsIn(JOB_TYPES)
  job_type?: JobType;

  @ApiPropertyOptional({
    description: 'The completed job this one re-tests, when there is one.',
  })
  @IsOptional()
  @IsString()
  previous_job_id?: string | null;

  @ApiPropertyOptional({ description: 'Centre snowflake ID' })
  @IsOptional()
  @IsString()
  centre_id?: string;

  @ApiPropertyOptional({ description: 'Line snowflake ID' })
  @IsOptional()
  @IsString()
  line_id?: string;

  @ApiPropertyOptional({
    description:
      'User responsible for this job, chosen from those mapped to the line. Required when converting an appointment.',
    example: '2058858609483202561',
  })
  @IsOptional()
  @IsString({ message: 'assigned_user_id must be a string' })
  assigned_user_id?: string;

  @ApiPropertyOptional({ description: 'Admin PC snowflake ID' })
  @IsOptional()
  @IsString()
  admin_pc_id?: string;

  @ApiPropertyOptional({ description: 'Camera snowflake ID' })
  @IsOptional()
  @IsString()
  camera_id?: string;
}

export class UpdateJobDto extends PartialType(
  OmitType(CreateJobDto, ['job_id'] as const),
) {
  @ApiPropertyOptional({
    description: 'Overall test result',
    enum: JOB_OVERALL_RESULTS,
  })
  @IsOptional()
  @IsString()
  @IsIn([...JOB_OVERALL_RESULTS])
  overall_result?: (typeof JOB_OVERALL_RESULTS)[number] | null;

  @ApiPropertyOptional({ description: 'Generated IN file name' })
  @IsOptional()
  @IsString()
  infile_name?: string;

  @ApiPropertyOptional({ description: 'Generated IN file path' })
  @IsOptional()
  @IsString()
  infile_path?: string;

  @ApiPropertyOptional({ description: 'Received OUT file name' })
  @IsOptional()
  @IsString()
  outfile_name?: string;

  @ApiPropertyOptional({ description: 'Received OUT file path' })
  @IsOptional()
  @IsString()
  outfile_path?: string;

  @ApiPropertyOptional({ description: 'Test start timestamp' })
  @IsOptional()
  @IsDateString()
  started_at?: string;

  @ApiPropertyOptional({ description: 'Test completion timestamp' })
  @IsOptional()
  @IsDateString()
  completed_at?: string;

  @ApiPropertyOptional({ description: 'Invoice number' })
  @IsOptional()
  @IsString()
  invoice_no?: string;

  @ApiPropertyOptional({ description: 'Invoice date' })
  @IsOptional()
  @IsDateString()
  invoice_date?: string;
}

/**
 * Line and assignee chosen when converting an appointment into a job.
 *
 * Both are required: the IN file is written to the line's folder, and every job
 * must have someone responsible for it. The DTO is separate from CreateJobDto
 * because that one keeps them optional for jobs created by other paths.
 */
export class ConvertAppointmentDto {
  @ApiProperty({
    description: 'Line the job will run on.',
    example: '2058858609483202561',
  })
  @IsString({ message: 'line_id must be a string' })
  @IsNotEmpty({ message: 'Select the line this job will run on.' })
  line_id!: string;

  @ApiProperty({
    description: 'User responsible for the job — must be mapped to the line.',
    example: '2058858609483202562',
  })
  @IsString({ message: 'assigned_user_id must be a string' })
  @IsNotEmpty({ message: 'Select the user responsible for this job.' })
  assigned_user_id!: string;
}

/**
 * Request to generate a synthetic Admin PC OUT file for a plate.
 *
 * Development only — the real file comes from the inspection rig. See
 * OutfileGeneratorService for why this exists and why it is refused in
 * production.
 */
export class SetJobChargeDto {
  @ApiPropertyOptional({
    description:
      "The Charges-master row to price this job from, when the vehicle's own type is not configured at this centre (e.g. a Sedan mapped onto SUV). Null clears the mapping and falls back to the vehicle's type.",
    example: '2091839947215486977',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString({ message: 'charge_id must be a string' })
  charge_id?: string | null;
}

export class GenerateOutfileDto {
  @ApiProperty({
    description: 'Plate to generate the result for, e.g. 3157BCD.',
    example: '3157BCD',
  })
  @IsString({ message: 'plate_number must be a string' })
  @IsNotEmpty({ message: 'plate_number is required' })
  plate_number!: string;

  @ApiPropertyOptional({
    description:
      "Overall outcome to simulate. 'fail' fails the brake rig, which drives REJECTED and the provider's 14-day re-inspection window.",
    enum: ['pass', 'fail'],
    default: 'pass',
  })
  @IsOptional()
  @IsIn(['pass', 'fail'], { message: "result must be 'pass' or 'fail'" })
  result?: 'pass' | 'fail';
}
