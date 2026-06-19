import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';

export class CreateAdminPcDto {
  @ApiPropertyOptional({
    description: 'Unique numeric identifier (auto-generated if omitted)',
    example: 5001,
  })
  @IsInt({ message: 'admin_pc_id must be a valid integer' })
  @Min(1, { message: 'admin_pc_id must be greater than 0' })
  @IsOptional()
  admin_pc_id?: number;

  @ApiProperty({ description: 'Admin PC name (alphabets only)', example: 'MCT Reception' })
  @IsString({ message: 'name must be a string' })
  @IsNotEmpty({ message: 'name is required' })
  @Matches(/^[A-Za-z\s'-]+$/, {
    message: 'name must contain only alphabets',
  })
  name!: string;


  @ApiProperty({ description: 'Unique code (alphanumeric)', example: 'MCTRECP01' })
  @IsString({ message: 'code must be a string' })
  @IsNotEmpty({ message: 'code is required' })
  code!: string;

  @ApiProperty({
    description: 'IPv4 address in xxx.xxx.xxx.xxx format',
    example: '192.168.10.15',
  })
  @IsString({ message: 'ip address must be a string' })
  @IsNotEmpty({ message: 'ip address is required' })
  @Matches(/^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/, {
    message: 'ip_address must be a valid IPv4 address (example: 192.168.10.15)',
  })
  ip_address!: string;

  @ApiProperty({
    description: 'Assigned line snowflake ID (master.lines.id)',
    example: '2058858609483202561',
  })
  @ValidateIf((dto: CreateAdminPcDto) => !dto.line_ids?.length)
  @IsString({ message: 'line_id must be a string' })
  @IsNotEmpty({ message: 'A line must be selected' })
  line_id!: string;

  @ApiPropertyOptional({
    description: 'Assigned line snowflake IDs (alternative to line_id)',
    example: ['2058858609483202561'],
    type: [String],
  })
  @ValidateIf((dto: CreateAdminPcDto) => dto.line_ids !== undefined)
  @IsArray({ message: 'line_ids must be an array' })
  @ArrayMaxSize(1, { message: 'Only one line can be selected' })
  @IsString({ each: true, message: 'each line_id must be a string' })
  line_ids?: string[];

  @ApiPropertyOptional({ description: 'Description details', example: 'Reception PC' })
  @IsOptional()
  @IsString({ message: 'description must be a string' })
  description?: string;

  @ApiPropertyOptional({ description: 'PC status', example: 'Active', enum: ['Active', 'Inactive'] })
  @IsString({ message: 'status must be a string' })
  @IsIn(['Active', 'Inactive'], { message: 'status must be either Active or Inactive' })
  @IsOptional()
  status?: string;
}

export class UpdateAdminPcDto extends PartialType(
  OmitType(CreateAdminPcDto, ['admin_pc_id'] as const),
) { }
