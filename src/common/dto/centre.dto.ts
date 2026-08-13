import {
  IsBoolean,
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

export class CreateCentreDto {
  @ApiPropertyOptional({
    description: 'Unique numeric centre identifier (auto-generated if omitted)',
    example: 1001,
  })
  @IsInt({ message: 'centre_id must be a valid integer' })
  @Min(1, { message: 'centre_id must be greater than 0' })
  @IsOptional()
  centre_id?: number;

  @ApiProperty({
    description:
      'Centre name. Matches the entity column `centre_name` — distinct from `code`, which is the generated IVIS centre code.',
    example: 'Muscat Vehicle Inspection Center',
  })
  @IsString({ message: 'centre_name must be a string' })
  @IsNotEmpty({ message: 'centre_name is required' })
  @Matches(/^[A-Za-z\s'-]+$/, {
    message: 'centre_name must contain only alphabets',
  })
  centre_name!: string;

  @ApiPropertyOptional({
    description:
      'Centre code — auto-generated as CM + sequence (e.g. CM001). Ignored if supplied.',
    example: 'CM001',
  })
  @IsString({ message: 'code must be a string' })
  @IsOptional()
  code?: string;

  @ApiPropertyOptional({
    description: 'Centre details description',
    example: 'Main hub',
  })
  @IsOptional()
  @IsString({ message: 'description must be a string' })
  description?: string;

  @ApiPropertyOptional({
    description: 'Centre status',
    example: 'Active',
    enum: ['Active', 'Inactive'],
  })
  @IsString({ message: 'status must be a string' })
  @IsIn(['Active', 'Inactive'], {
    message: 'status must be either Active or Inactive',
  })
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({
    description: 'Auto-submit completed jobs to ROP for this centre',
    example: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'auto_submit must be a boolean' })
  auto_submit?: boolean;

  @ApiPropertyOptional({
    description:
      "The appointment provider's branch code for this centre, chosen from GET /masters/centres/branches. Distinct from `code` above, which is the IVIS centre code — both name the same physical centre. Send null or an empty string to clear the link.",
    example: 'SBX',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsString({ message: 'provider_branch_code must be a string' })
  @Matches(/^[A-Z0-9]{2,16}$/, {
    message: 'provider_branch_code must be uppercase alphanumeric',
  })
  provider_branch_code?: string | null;
}

export class UpdateCentreDto extends PartialType(
  OmitType(CreateCentreDto, ['centre_id'] as const),
) {}
