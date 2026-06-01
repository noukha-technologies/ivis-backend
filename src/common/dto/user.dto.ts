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
  @ApiPropertyOptional({ description: 'Unique numeric user identifier (auto-generated if omitted)', example: 1001 })
  @IsInt({ message: 'user_id must be a valid integer' })
  @Min(1, { message: 'user_id must be greater than 0' })
  @IsOptional()
  user_id?: number;

  @ApiProperty({
    description: 'Unique alphanumeric user code',
    example: 'USR1001',
  })
  @IsString({ message: 'user_code must be a string' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(USER_CODE_PATTERN, { message: 'user_code must contain only letters and numbers' })
  @MinLength(2, { message: 'user_code must be at least 2 characters' })
  @MaxLength(32, { message: 'user_code must be at most 32 characters' })
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
    description: 'Role access snowflake ID (core.role_access.id)',
    example: '2058858609483202561',
  })
  @IsString({ message: 'role_access_id must be a string' })
  @IsNotEmpty({ message: 'role_access_id is required' })
  role_access_id!: string;

  @ApiPropertyOptional({
    description: 'Assigned centre snowflake ID (master.centres.id)',
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

  @ApiPropertyOptional({
    description: 'Creator user snowflake ID',
    example: '2058858609483202561',
  })
  @IsString({ message: 'created_by must be a string' })
  @IsOptional()
  created_by?: string;
}

/** All fields optional; user_id cannot be updated after creation. */
export class UpdateUserDto extends PartialType(
  OmitType(CreateUserDto, ['user_id'] as const),
) { }
