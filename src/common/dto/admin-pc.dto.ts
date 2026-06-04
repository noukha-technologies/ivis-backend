import { IsInt, IsNotEmpty, IsOptional, IsString, Min, IsIn } from 'class-validator';
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

  @ApiProperty({ description: 'Admin PC Name', example: 'MCT-RECP-01' })
  @IsString({ message: 'name must be a string' })
  @IsNotEmpty({ message: 'name is required' })
  name!: string;

  @ApiProperty({ description: 'Unique code identifier', example: 'VT-SED' })
  @IsString({ message: 'code must be a string' })
  @IsNotEmpty({ message: 'code is required' })
  code!: string;

  @ApiProperty({ description: 'IP Address', example: '192.168.10.15' })
  @IsString({ message: 'ip_address must be a string' })
  @IsNotEmpty({ message: 'ip_address is required' })
  ip_address!: string;

  @ApiProperty({ description: 'Assigned line snowflake ID (master.lines.id)', example: '2058858609483202561' })
  @IsString({ message: 'line_id must be a string' })
  @IsNotEmpty({ message: 'line_id is required' })
  line_id!: string;

  @ApiPropertyOptional({ description: 'Description details', example: 'Reception PC' })
  @IsString({ message: 'description must be a string' })
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'PC status', example: 'Active', enum: ['Active', 'Inactive'] })
  @IsString({ message: 'status must be a string' })
  @IsIn(['Active', 'Inactive'], { message: 'status must be either Active or Inactive' })
  @IsOptional()
  status?: string;

}

export class UpdateAdminPcDto extends PartialType(
  OmitType(CreateAdminPcDto, ['admin_pc_id'] as const),
) {}
