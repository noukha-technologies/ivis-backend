import { IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/** Plate types the appointment provider recognises. */
export const PLATE_TYPES = [
  'PRIVATE',
  'COMMERCIAL',
  'TAXI',
  'GOVERNMENT',
  'DIPLOMATIC',
  'RENTAL',
  'MOTORCYCLE',
  'EXPORT',
] as const;

export class OnlineAppointmentQueryDto {
  @ApiPropertyOptional({
    description:
      'Day to list, as YYYY-MM-DD in Oman local time. Defaults to today.',
    example: '2026-08-11',
  })
  @IsOptional()
  @IsString({ message: 'date must be a string' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be in YYYY-MM-DD format',
  })
  date?: string;
}

export class OnlineAppointmentPlateQueryDto extends OnlineAppointmentQueryDto {
  @ApiPropertyOptional({
    description:
      'Plate type. A vehicle is the pair (plate_number, plate_type) — the same number under two types is two different vehicles.',
    enum: PLATE_TYPES,
    default: 'PRIVATE',
  })
  @IsOptional()
  @IsIn(PLATE_TYPES, {
    message: `plate_type must be one of: ${PLATE_TYPES.join(', ')}`,
  })
  plate_type?: (typeof PLATE_TYPES)[number];
}
