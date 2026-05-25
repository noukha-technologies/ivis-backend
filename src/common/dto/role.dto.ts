import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateRoleDto {
  @ApiProperty({ description: 'Unique name of the role', example: 'admin' })
  @IsString({ message: 'role_name must be a string' })
  @IsNotEmpty({ message: 'role_name is required' })
  role_name!: string;

  @ApiPropertyOptional({ description: 'Description of the role', example: 'Administrator with full access' })
  @IsString({ message: 'description must be a string' })
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    description: 'Creator user snowflake ID',
    example: '2058858609483202561',
  })
  @IsString({ message: 'created_by must be a string' })
  @IsOptional()
  created_by?: string;
}

export class UpdateRoleDto extends PartialType(CreateRoleDto) {}
