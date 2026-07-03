import {
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
import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';

export class CreateAdminPcDto {
  @ApiPropertyOptional({
    description: 'Unique numeric identifier (auto-generated if omitted)',
    example: 5001,
  })
  @IsInt({ message: 'admin_pc_id must be a valid integer' })
  @Min(1, { message: 'admin_pc_id must be greater than 0' })
  @IsOptional()
  admin_pc_id?: number;

  @ApiProperty({
    description:
      'Admin PC name (letters, numbers, spaces, and hyphens/underscores)',
    example: 'MCT Reception 01',
  })
  @IsString({ message: 'name must be a string' })
  @IsNotEmpty({ message: 'name is required' })
  @Matches(/^[A-Za-z0-9\s'_-]+$/, {
    message:
      'name must contain only letters, numbers, spaces, and hyphens/underscores',
  })
  name!: string;

  @ApiPropertyOptional({
    description: 'Unique code (alphanumeric, auto-generated if omitted)',
    example: 'APC001',
  })
  @IsString({ message: 'code must be a string' })
  @IsOptional()
  code?: string;

  @ApiProperty({
    description: 'IPv4 address in xxx.xxx.xxx.xxx format',
    example: '192.168.10.15',
  })
  @IsString({ message: 'ip address must be a string' })
  @IsNotEmpty({ message: 'ip address is required' })
  @Matches(
    /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/,
    {
      message:
        'ip_address must be a valid IPv4 address (example: 192.168.10.15)',
    },
  )
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
    description:
      'Assigned line snowflake IDs (alternative to line_id); supports multiple lines',
    example: ['2058858609483202561', '2058858609483202562'],
    type: [String],
  })
  @ValidateIf((dto: CreateAdminPcDto) => dto.line_ids !== undefined)
  @IsArray({ message: 'line_ids must be an array' })
  @IsString({ each: true, message: 'each line_id must be a string' })
  line_ids?: string[];

  @ApiPropertyOptional({
    description: 'Associated Center snowflake ID (master.centres.id)',
    example: '2058858609483202560',
  })
  @IsString({ message: 'center_id must be a string' })
  @IsOptional()
  center_id?: string;

  @ApiPropertyOptional({
    description: 'IN-file folder path (generated IN files)',
    example: '//192.168.10.10/Admin1/Line1/Infolder',
  })
  @IsOptional()
  @IsString({ message: 'in_file_path must be a string' })
  in_file_path?: string;

  @ApiPropertyOptional({
    description: 'OUT-file folder path (watched for results)',
    example: '//192.168.10.10/Admin1/Line1/Outfolder',
  })
  @IsOptional()
  @IsString({ message: 'out_file_path must be a string' })
  out_file_path?: string;

  @ApiPropertyOptional({
    description: 'Description details',
    example: 'Reception PC',
  })
  @IsOptional()
  @IsString({ message: 'description must be a string' })
  description?: string;

  @ApiPropertyOptional({
    description: 'PC status',
    example: 'Active',
    enum: ['Active', 'Inactive'],
  })
  @IsString({ message: 'status must be a string' })
  @IsIn(['Active', 'Inactive'], {
    message: 'status must be either Active or Inactive',
  })
  @IsOptional()
  status?: string;
}

export class UpdateAdminPcDto extends PartialType(
  OmitType(CreateAdminPcDto, ['admin_pc_id'] as const),
) {}
