import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import {
  JOB_OVERALL_RESULTS,
  JOB_SOURCES,
  JOB_STATUSES,
} from '../enums/job.enums';

export class CreateJobDto {
  @ApiPropertyOptional({
    description: 'Unique numeric job identifier (auto-generated if omitted)',
    example: 1,
  })
  @IsInt()
  @Min(1)
  @IsOptional()
  job_id?: number;

  @ApiProperty({ description: 'Job source', example: 'Booked', enum: JOB_SOURCES })
  @IsString()
  @IsIn([...JOB_SOURCES])
  source!: (typeof JOB_SOURCES)[number];

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

  @ApiPropertyOptional({ description: 'Creator user snowflake ID' })
  @IsOptional()
  @IsString()
  created_by?: string;
}

export class UpdateJobDto extends PartialType(
  OmitType(CreateJobDto, ['job_id'] as const),
) {
  @ApiPropertyOptional({ description: 'Overall test result', enum: JOB_OVERALL_RESULTS })
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
}
