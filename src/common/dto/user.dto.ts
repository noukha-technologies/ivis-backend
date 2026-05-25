import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType, OmitType } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiPropertyOptional({ description: 'Unique numeric user identifier (auto-generated if omitted)', example: 1001 })
  @IsInt({ message: 'user_id must be a valid integer' })
  @Min(1, { message: 'user_id must be greater than 0' })
  @IsOptional()
  user_id?: number;

  @ApiProperty({ description: 'Full name of the user', example: 'John Doe' })
  @IsString({ message: 'user_name must be a string' })
  @IsNotEmpty({ message: 'user_name is required' })
  user_name!: string;

  @ApiProperty({ description: 'Email address (must be unique)', example: 'john.doe@example.com' })
  @IsEmail({}, { message: 'email must be a valid email address' })
  @IsNotEmpty({ message: 'email is required' })
  email!: string;

  @ApiProperty({
    description: 'Business role ID (master.roles.role_id)',
    example: 2,
  })
  @IsInt({ message: 'role_id must be a valid integer' })
  @Min(1, { message: 'role_id must be greater than 0' })
  role_id!: number;

  @ApiPropertyOptional({ description: 'Center / location of the user', example: 'Center-A' })
  @IsString({ message: 'center must be a string' })
  @IsOptional()
  center?: string;

  @ApiPropertyOptional({ description: 'Production line assigned to the user', example: 'Line-1' })
  @IsString({ message: 'line must be a string' })
  @IsOptional()
  line?: string;

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

/** All fields optional; user_id cannot be updated after creation. */
export class UpdateUserDto extends PartialType(
  OmitType(CreateUserDto, ['user_id'] as const),
) { }
