import {
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  Validate,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import {
  UserCentreLinePairConstraint,
  UserCreateCentreLineConstraint,
} from '../validators/user-centre-line.validator.js';

export class CreateUserDto {
  @ApiProperty({
    description: 'Unique user code (alphanumeric)',
    example: 'USR1001',
  })
  @IsString({ message: 'user_code must be a string' })
  @IsNotEmpty({ message: 'user_code is required' })
  @Matches(/^[A-Za-z0-9]+$/, {
    message: 'user_code must be alphanumeric',
  })
  user_code!: string;

  @ApiProperty({ description: 'Full name (alphabets only)', example: 'Ahmed Al Said' })
  @IsString({ message: 'user_name must be a string' })
  @IsNotEmpty({ message: 'user_name is required' })
  @Matches(/^[A-Za-z\s'-]+$/, {
    message: 'user_name must contain only alphabets',
  })
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
  @IsNotEmpty({ message: 'Please select a role' })
  role_id!: string;

  @ApiProperty({
    description: 'Assigned centre snowflake ID (master.centres.id)',
    example: '2058858609483202561',
  })
  @Validate(UserCreateCentreLineConstraint)
  @IsString({ message: 'center_id must be a string' })
  @IsNotEmpty({ message: 'Please select a centre' })
  center_id!: string;

  @ApiPropertyOptional({
    description: 'Single assigned line snowflake ID (alternative to line_ids)',
    example: '2058858609483202562',
  })
  @IsOptional()
  @IsString({ message: 'line_id must be a string' })
  line_id?: string;

  @ApiProperty({
    description: 'Assigned line snowflake IDs (master.lines.id)',
    example: ['2058858609483202562'],
    type: [String],
  })
  @IsOptional()
  @IsArray({ message: 'line_ids must be an array' })
  @IsString({ each: true, message: 'each line_id must be a string' })
  line_ids?: string[];

  @ApiProperty({
    description:
      'Login password (min 8 chars, uppercase, lowercase, number, special character)',
    example: 'P@ssw0rd1',
    minLength: 8,
  })
  @IsString({ message: 'password must be a string' })
  @IsNotEmpty({ message: 'password is required' })
  @MinLength(8, { message: 'password must be at least 8 characters' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/, {
    message:
      'password must include uppercase, lowercase, number, and special character',
  })
  password!: string;
}

export class UpdateUserDto extends PartialType(
  OmitType(CreateUserDto, ['password', 'center_id', 'line_id', 'line_ids'] as const),
) {
  @ValidateIf(
    (dto: UpdateUserDto) =>
      dto.center_id !== undefined ||
      dto.line_ids !== undefined ||
      dto.line_id !== undefined,
  )
  @Validate(UserCentreLinePairConstraint)
  @IsOptional()
  @IsString({ message: 'center_id must be a string' })
  center_id?: string;

  @ApiPropertyOptional({
    description: 'Single assigned line snowflake ID (alternative to line_ids)',
    example: '2058858609483202562',
  })
  @IsOptional()
  @IsString({ message: 'line_id must be a string' })
  line_id?: string;

  @ApiPropertyOptional({
    description: 'Assigned line snowflake IDs (master.lines.id)',
    example: ['2058858609483202562'],
    type: [String],
  })
  @IsOptional()
  @IsArray({ message: 'line_ids must be an array' })
  @IsString({ each: true, message: 'each line_id must be a string' })
  line_ids?: string[];
}
