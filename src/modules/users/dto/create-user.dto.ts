import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({
    description: 'Unique numeric user identifier',
    example: 1001,
  })
  @IsInt({ message: 'user_id must be a valid integer' })
  @Min(1, { message: 'user_id must be greater than 0' })
  @IsNotEmpty({ message: 'user_id is required' })
  user_id!: number;

  @ApiProperty({
    description: 'Full name of the user',
    example: 'John Doe',
  })
  @IsString({ message: 'user_name must be a string' })
  @IsNotEmpty({ message: 'user_name is required' })
  user_name!: string;

  @ApiProperty({
    description: 'Email address (must be unique)',
    example: 'john.doe@example.com',
  })
  @IsEmail({}, { message: 'email must be a valid email address' })
  @IsNotEmpty({ message: 'email is required' })
  email!: string;

  @ApiProperty({
    description: 'Role of the user',
    example: 'admin',
  })
  @IsString({ message: 'role must be a string' })
  @IsNotEmpty({ message: 'role is required' })
  role!: string;

  @ApiPropertyOptional({
    description: 'Center / location of the user',
    example: 'Center-A',
  })
  @IsString({ message: 'center must be a string' })
  @IsOptional()
  center?: string;

  @ApiPropertyOptional({
    description: 'Production line assigned to the user',
    example: 'Line-1',
  })
  @IsString({ message: 'line must be a string' })
  @IsOptional()
  line?: string;
}
