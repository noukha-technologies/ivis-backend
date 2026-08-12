import { PaginationQueryDto } from './pagination.dto';
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

export class OnlineAppointmentQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description:
      'Day to list, as YYYY-MM-DD in Oman local time. Defaults to today. Kept for the single-day plate lookup; the list uses date_from/date_to.',
    example: '2026-08-11',
  })
  @IsOptional()
  @IsString({ message: 'date must be a string' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be in YYYY-MM-DD format',
  })
  date?: string;

  @ApiPropertyOptional({
    description:
      'Start of the range, YYYY-MM-DD Oman local. Defaults to today. Served from the local mirror, so any span is a single query.',
    example: '2026-08-01',
  })
  @IsOptional()
  @IsString({ message: 'date_from must be a string' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date_from must be in YYYY-MM-DD format',
  })
  date_from?: string;

  @ApiPropertyOptional({
    description: 'End of the range, YYYY-MM-DD Oman local. Defaults to today.',
    example: '2026-08-12',
  })
  @IsOptional()
  @IsString({ message: 'date_to must be a string' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date_to must be in YYYY-MM-DD format',
  })
  date_to?: string;
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
