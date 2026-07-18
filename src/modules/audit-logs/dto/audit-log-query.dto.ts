import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import {
  AUDIT_ACTION_VALUES,
  AuditActionValue,
} from '../../database/entity/audit-log.entity';

/**
 * List query for audit logs: shared pagination plus convenience filters.
 * `search` still covers user_name / description / entity / action (ILIKE).
 */
export class AuditLogQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by performer display name (ILIKE contains)',
    example: 'Super Admin',
  })
  @IsOptional()
  @IsString()
  performedBy?: string;

  @ApiPropertyOptional({
    description: 'Filter by audit action code',
    enum: AUDIT_ACTION_VALUES,
    example: 'UPDATE',
  })
  @IsOptional()
  @IsIn([...AUDIT_ACTION_VALUES])
  action?: AuditActionValue;

  @ApiPropertyOptional({
    description: 'Inclusive start date for created_at (YYYY-MM-DD or ISO)',
    example: '2026-07-01',
  })
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @ApiPropertyOptional({
    description: 'Inclusive end date for created_at (YYYY-MM-DD or ISO)',
    example: '2026-07-15',
  })
  @IsOptional()
  @IsString()
  dateTo?: string;
}
