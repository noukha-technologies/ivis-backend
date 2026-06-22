import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';

export class CreateCameraDto {
  @ApiPropertyOptional({
    description: 'Unique numeric identifier (auto-generated if omitted)',
    example: 6001,
  })
  @IsInt({ message: 'camera_id must be a valid integer' })
  @Min(1, { message: 'camera_id must be greater than 0' })
  @IsOptional()
  camera_id?: number;

  @ApiProperty({ description: 'Camera name (alphabets only)', example: 'Gate 1 ANPR' })
  @IsString({ message: 'camera_name must be a string' })
  @IsNotEmpty({ message: 'camera_name is required' })
  camera_name!: string;

  @ApiProperty({ description: 'Unique code (alphanumeric)', example: 'CAM01' })
  @IsString({ message: 'code must be a string' })
  @IsNotEmpty({ message: 'code is required' })
  code!: string;

  @ApiProperty({ description: 'Assigned line snowflake ID', example: '2058858609483202561' })
  @IsString({ message: 'line_id must be a string' })
  @IsNotEmpty({ message: 'A line must be selected' })
  line_id!: string;

  @ApiProperty({
    description: 'IPv4 address of the camera in xxx.xxx.xxx.xxx format',
    example: '192.168.1.100',
  })
  @IsString({ message: 'ip_address must be a string' })
  @IsNotEmpty({ message: 'ip_address is required' })
  ip_address!: string;

  @ApiProperty({ description: 'Camera port number (1–65535)', example: 80 })
  @IsInt({ message: 'port must be a valid integer' })
  @Min(1, { message: 'port must be at least 1' })
  @Max(65535, { message: 'port must be at most 65535' })
  port!: number;

  @ApiPropertyOptional({ description: 'Camera login username', example: 'admin' })
  @IsOptional()
  @IsString({ message: 'username must be a string' })
  username?: string;

  @ApiPropertyOptional({ description: 'Camera login password', example: 'Hikvision@123' })
  @IsOptional()
  @IsString({ message: 'password must be a string' })
  password?: string;

  @ApiPropertyOptional({ description: 'Integration method', example: 'ftp', enum: ['ftp', 'http'] })
  @IsOptional()
  @IsIn(['ftp', 'http'], { message: 'integration_method must be ftp or http' })
  integration_method?: 'ftp' | 'http';

  @ApiPropertyOptional({ description: 'FTP directory path for FTP-based integration', example: '/cameras/gate1' })
  @ValidateIf((o) => o.integration_method === 'ftp')
  @IsNotEmpty({ message: 'ftp_directory is required when integration method is FTP' })
  @IsString({ message: 'ftp_directory must be a string' })
  ftp_directory?: string;

  @ApiPropertyOptional({ description: 'Description details', example: 'Main entrance ANPR' })
  @IsOptional()
  @IsString({ message: 'description must be a string' })
  description?: string;

  @ApiPropertyOptional({ description: 'Camera status', example: 'Active', enum: ['Active', 'Inactive'] })
  @IsString({ message: 'status must be a string' })
  @IsIn(['Active', 'Inactive'], { message: 'status must be either Active or Inactive' })
  @IsOptional()
  status?: string;
}

export class UpdateCameraDto extends PartialType(
  OmitType(CreateCameraDto, ['camera_id'] as const),
) { }
