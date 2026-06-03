import {
  IsArray,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType, OmitType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

const USER_CODE_PATTERN = /^[A-Za-z0-9]+$/;

export class CreateUserDto {
  @ApiProperty({
    description: 'Unique alphanumeric user code',
    example: 'USR1001',
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

  @ApiProperty({
    description: 'Assigned centre snowflake ID (master.centres.id); one user per centre',
    example: '2058858609483202561',
  })
  @IsString({ message: 'center_id must be a string' })
  @IsNotEmpty({ message: 'center_id is required' })
  center_id!: string;

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

  @ApiPropertyOptional({
    description: 'Creator user snowflake ID',
    example: '2058858609483202561',
  })
  @IsString({ message: 'created_by must be a string' })
  @IsOptional()
  created_by?: string;
}

/** All fields optional. */
export class UpdateUserDto extends PartialType(CreateUserDto) { }
