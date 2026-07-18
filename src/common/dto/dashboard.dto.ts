import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class DashboardOverviewQueryDto {
  @ApiPropertyOptional({
    description:
      'Centre snowflake ID. Required for Super Admin (global scope). Ignored for centre-scoped users.',
    example: '2058858609483202561',
  })
  @IsOptional()
  @IsString()
  centre_id?: string;
}

export class DashboardKpiMetricDto {
  @ApiProperty({ example: 184 })
  today!: number;

  @ApiProperty({ example: 130 })
  yesterday!: number;

  @ApiPropertyOptional({
    description: 'Percent change vs yesterday; null when yesterday is 0',
    example: 12,
    nullable: true,
  })
  change_percent!: number | null;
}

export class DashboardKpisDto {
  @ApiProperty({ type: DashboardKpiMetricDto })
  vehicles_today!: DashboardKpiMetricDto;

  @ApiProperty({ type: DashboardKpiMetricDto })
  pass!: DashboardKpiMetricDto;

  @ApiProperty({ type: DashboardKpiMetricDto })
  fail!: DashboardKpiMetricDto;

  @ApiProperty({ type: DashboardKpiMetricDto })
  in_progress!: DashboardKpiMetricDto;
}

export class DashboardLineStatusDto {
  @ApiProperty({ description: 'Line snowflake ID' })
  id!: string;

  @ApiProperty({ example: 'Line 1' })
  name!: string;

  @ApiProperty({ example: 10 })
  in_progress!: number;
}

export class DashboardCameraStatusDto {
  @ApiProperty({ description: 'Cameras with health_status ONLINE', example: 10 })
  active!: number;

  @ApiProperty({ description: 'Total non-deleted cameras for the centre', example: 15 })
  total!: number;
}

export class DashboardInProgressJobDto {
  @ApiProperty({ description: 'Job snowflake ID' })
  job_id!: string;

  @ApiProperty({ example: 'OM-1000' })
  plate_number!: string;

  @ApiPropertyOptional({ example: 'Ahmed Al Said', nullable: true })
  customer_name!: string | null;

  @ApiPropertyOptional({ example: 'Line 1', nullable: true })
  line_name!: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'When the job entered In Progress' })
  started_at!: Date | null;
}

export class DashboardSystemHealthDto {
  @ApiProperty({ description: 'Whether the API server has a live DB connection' })
  database_connected!: boolean;

  @ApiProperty({ description: 'Cameras with health_status ONLINE', example: 10 })
  anpr_cameras_active!: number;

  @ApiProperty({ description: 'Total non-deleted cameras for the centre', example: 15 })
  anpr_cameras_total!: number;

  @ApiPropertyOptional({ nullable: true, description: 'Timestamp of the most recent ANPR capture for this centre' })
  last_anpr_capture_at!: Date | null;

  @ApiPropertyOptional({ nullable: true, description: 'Timestamp of the most recent appointment created for this centre' })
  last_appointment_at!: Date | null;

  @ApiProperty({ description: 'Appointments created today for this centre', example: 12 })
  appointments_today!: number;

  @ApiProperty({ description: 'Jobs created today for this centre', example: 8 })
  jobs_today!: number;
}

export class DashboardOverviewResponseDto {
  @ApiProperty({ description: 'Resolved centre snowflake ID' })
  centre_id!: string;

  @ApiProperty({ type: DashboardKpisDto })
  kpis!: DashboardKpisDto;

  @ApiProperty({ type: [DashboardLineStatusDto] })
  lines!: DashboardLineStatusDto[];

  @ApiProperty({ type: DashboardCameraStatusDto })
  cameras!: DashboardCameraStatusDto;

  @ApiProperty({
    type: [DashboardInProgressJobDto],
    description: 'Most recent in-progress jobs for the centre (capped)',
  })
  in_progress_jobs!: DashboardInProgressJobDto[];

  @ApiProperty({ type: DashboardSystemHealthDto })
  system_health!: DashboardSystemHealthDto;
}
