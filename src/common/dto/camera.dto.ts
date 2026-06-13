import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Min,
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

  @ApiProperty({ description: 'Camera name (alphabets only)', example: 'ANPR Main Entrance' })
  @IsString({ message: 'name must be a string' })
  @IsNotEmpty({ message: 'name is required' })
  @Matches(/^[A-Za-z\s'-]+$/, {
    message: 'name must contain only alphabets',
  })
  name!: string;

  @ApiProperty({ description: 'Unique code (alphanumeric)', example: 'CAM01' })
  @IsString({ message: 'code must be a string' })
  @IsNotEmpty({ message: 'code is required' })
  @Matches(/^[A-Za-z0-9]+$/, {
    message: 'code must be alphanumeric',
  })
  code!: string;

  @ApiProperty({ description: 'Camera type', example: 'ANPR' })
  @IsString({ message: 'type must be a string' })
  @IsNotEmpty({ message: 'type is required' })
  type!: string;

  @ApiProperty({ description: 'Assigned line snowflake ID', example: '2058858609483202561' })
  @IsString({ message: 'line_id must be a string' })
  @IsNotEmpty({ message: 'A line must be selected' })
  line_id!: string;

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
) {}
