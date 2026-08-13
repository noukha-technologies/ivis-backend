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

export class CreateLineDto {
  @ApiPropertyOptional({
    description: 'Unique numeric line identifier (auto-generated if omitted)',
    example: 1001,
  })
  @IsInt({ message: 'line_id must be a valid integer' })
  @Min(1, { message: 'line_id must be greater than 0' })
  @IsOptional()
  line_id?: number;

  @ApiProperty({
    description: 'Line name (letters and numbers allowed)',
    example: 'Line 1',
  })
  @IsString({ message: 'name must be a string' })
  @IsNotEmpty({ message: 'name is required' })
  name!: string;

  @ApiProperty({
    description: 'Line unique code (alphanumeric)',
    example: 'LN001',
  })
  @IsString({ message: 'code must be a string' })
  @IsNotEmpty({ message: 'code is required' })
  code!: string;

  @ApiProperty({
    description: 'Parent centre snowflake ID (master.centres.id)',
    example: '2058858609483202561',
  })
  @IsString({ message: 'centre id must be a string' })
  @IsNotEmpty({ message: 'centre id is required' })
  centre_id!: string;

  @ApiProperty({ description: 'Line display order', example: 1 })
  @IsInt({ message: 'display_order must be an integer' })
  @IsNotEmpty({ message: 'display order is required' })
  @Min(1, { message: 'display order must be at least 1' })
  display_order!: number;

  @ApiPropertyOptional({
    description:
      "The appointment provider's lane id for this line (L1, L2, ...), as returned by GET /branches for the centre's branch. Distinct from `code` above, which is the IVIS line code. Normally set automatically when the centre is linked; set it here to correct a mismatch. Send null or an empty string to clear it.",
    example: 'L1',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsString({ message: 'provider_lane_id must be a string' })
  @Matches(/^[A-Z0-9]{1,16}$/i, {
    message: 'provider_lane_id must be alphanumeric, e.g. L1',
  })
  provider_lane_id?: string | null;

  @ApiPropertyOptional({
    description:
      'Set true to accept swapping lanes with the line that currently holds the requested lane. Without it, a taken lane returns 409 with the holder so the client can confirm.',
    example: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'confirm_lane_swap must be a boolean' })
  confirm_lane_swap?: boolean;

  @ApiPropertyOptional({
    description: 'Line details description',
    example: 'Light vehicle lane',
  })
  @IsOptional()
  @IsString({ message: 'description must be a string' })
  description?: string;

  @ApiPropertyOptional({
    description: 'Line IN-file folder path',
    example: '//192.168.10.10/Admin1/Line1/Infolder',
  })
  @IsOptional()
  @IsString({ message: 'in_file_path must be a string' })
  in_file_path?: string;

  @ApiPropertyOptional({
    description: 'Line OUT-file folder path',
    example: '//192.168.10.10/Admin1/Line1/Outfolder',
  })
  @IsOptional()
  @IsString({ message: 'out_file_path must be a string' })
  out_file_path?: string;

  @ApiPropertyOptional({
    description: 'Line status',
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

export class UpdateLineDto extends PartialType(
  OmitType(CreateLineDto, ['line_id'] as const),
) {}
