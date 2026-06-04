import {
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({
    description: 'Unique user code (any string)',
    example: 'iv-01',
  })
  @IsString({ message: 'user_code must be a string' })
  @IsNotEmpty({ message: 'user_code is required' })
  user_code!: string;

  @ApiProperty({ description: 'Full name of the user', example: 'John Doe' })
  @IsString({ message: 'user_name must be a string' })
  @IsNotEmpty({ message: 'user_name is required' })
  user_name!: string;

  @ApiProperty({ description: 'Email address (must be unique)', example: 'john.doe@example.com' })
  @IsEmail({}, { message: 'email must be a valid email address' })
  @IsNotEmpty({ message: 'email is required' })
  email!: string;

  @ApiProperty({
    description: 'Role snowflake ID (core.roles.id)',
    example: '2058858609483202561',
  })
  @IsString({ message: 'role_id must be a string' })
  @IsNotEmpty({ message: 'role_id is required' })
  role_id!: string;

  @ApiPropertyOptional({
    description:
      'Assigned centre snowflake ID (master.centres.id); optional — line_ids required when set',
    example: '2058858609483202561',
  })
  @IsString({ message: 'center_id must be a string' })
  @IsOptional()
  center_id?: string;

  @ApiPropertyOptional({
    description: 'Assigned line snowflake IDs (master.lines.id)',
    example: ['2058858609483202562'],
    type: [String],
  })
  @IsArray({ message: 'line_ids must be an array' })
  @IsString({ each: true, message: 'each line_id must be a string' })
  @IsOptional()
  line_ids?: string[];

  @ApiProperty({
    description: 'Login password (stored as bcrypt hash)',
    example: 'P@ssw0rd123',
    minLength: 8,
  })
  @IsString()
  @MinLength(8)
  @IsNotEmpty()
  password!: string;

}

/** All fields optional. */
export class UpdateUserDto extends PartialType(CreateUserDto) { }
