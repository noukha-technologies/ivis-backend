import { IsInt, IsNotEmpty, IsOptional, IsString, Min, IsIn } from 'class-validator';
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

  @ApiProperty({ description: 'Camera Name', example: 'ANPR-MCT-IN-1' })
  @IsString({ message: 'name must be a string' })
  @IsNotEmpty({ message: 'name is required' })
  name!: string;

  @ApiProperty({ description: 'Unique code identifier', example: 'CAM01' })
  @IsString({ message: 'code must be a string' })
  @IsNotEmpty({ message: 'code is required' })
  code!: string;

  @ApiProperty({ description: 'Camera type: CCTV or ANPR', example: 'ANPR' })
  @IsString({ message: 'type must be a string' })
  @IsNotEmpty({ message: 'type is required' })
  type!: string;

  @ApiProperty({ description: 'Assigned line Snowflake ID', example: '2058858609483202561' })
  @IsString({ message: 'line_id must be a string' })
  @IsNotEmpty({ message: 'line_id is required' })
  line_id!: string;

  @ApiPropertyOptional({ description: 'Description details', example: 'Main entrance ANPR' })
  @IsString({ message: 'description must be a string' })
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Camera status', example: 'Active', enum: ['Active', 'Inactive'] })
  @IsString({ message: 'status must be a string' })
  @IsIn(['Active', 'Inactive'], { message: 'status must be either Active or Inactive' })
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ description: 'Creator user snowflake ID', example: '2058858609483202561' })
  @IsString({ message: 'created_by must be a string' })
  @IsOptional()
  created_by?: string;
}

export class UpdateCameraDto extends PartialType(
  OmitType(CreateCameraDto, ['camera_id'] as const),
) {}
