import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

import { PaginatedResult } from '../../../common/interfaces/pagination.interface';
import {
  DateFieldFilter,
  PrimitiveFieldFilter,
  QueryFilter,
  RegexFieldFilter,
} from '../../../common/shared/filter/filter.dto';
import {
  buildTypeOrmPaginationOptions,
  toPaginatedResult,
} from '../../../common/shared/pagination/pagination-query.util';
import { PaginationService } from '../../../common/shared/pagination/pagination.service';
import { generateSnowflakeId } from '../../../common/shared/snowflakeIdGeneration';
import { AuditLogQueryDto } from '../../audit-logs/dto/audit-log-query.dto';
import {
  AuditActionValue,
  AuditLog,
} from '../entity/audit-log.entity';

export type CreateAuditLogInput = {
  user_id?: string | null;
  user_name?: string | null;
  action: AuditActionValue;
  entity_type?: string | null;
  entity_id?: string | null;
  description: string;
  ip_address?: string | null;
  user_agent?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
};

/** Escape a string for safe use as a Postgres regex substring match. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Date-only strings (`YYYY-MM-DD`) become start/end of that calendar day (UTC)
 * so inclusive date filters cover the full day.
 */
function normalizeDateFrom(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return `${value.trim()}T00:00:00.000Z`;
  }
  return value;
}

function normalizeDateTo(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return `${value.trim()}T23:59:59.999Z`;
  }
  return value;
}

function mergeConvenienceFilters(query: AuditLogQueryDto): AuditLogQueryDto {
  const extra: QueryFilter[] = [];

  if (query.performedBy?.trim()) {
    const performedByFilter: RegexFieldFilter = {
      type: 'filter',
      filterType: 'RegexField',
      field: 'user_name',
      pattern: escapeRegex(query.performedBy.trim()),
      caseSensitive: false,
    };
    extra.push(performedByFilter);
  }

  if (query.action) {
    const actionFilter: PrimitiveFieldFilter = {
      type: 'filter',
      filterType: 'PrimitiveField',
      field: 'action',
      value: query.action,
      operator: 'EQUALS',
    };
    extra.push(actionFilter);
  }

  if (query.dateFrom?.trim() || query.dateTo?.trim()) {
    const dateFilter: DateFieldFilter = {
      type: 'filter',
      filterType: 'DateField',
      field: 'created_at',
      ...(query.dateFrom?.trim()
        ? { from: normalizeDateFrom(query.dateFrom.trim()) }
        : {}),
      ...(query.dateTo?.trim()
        ? { to: normalizeDateTo(query.dateTo.trim()) }
        : {}),
    };
    extra.push(dateFilter);
  }

  if (extra.length === 0) {
    return query;
  }

  let existing: QueryFilter[] = [];
  if (query.filters?.trim()) {
    try {
      const parsed: unknown = JSON.parse(query.filters);
      if (Array.isArray(parsed)) {
        existing = parsed as QueryFilter[];
      }
    } catch {
      // Let buildTypeOrmPaginationOptions surface the BadRequest for invalid JSON.
      return query;
    }
  }

  return {
    ...query,
    filters: JSON.stringify([...existing, ...extra]),
  };
}

@Injectable()
export class AuditLogDao extends Repository<AuditLog> {
  constructor(
    private readonly dataSource: DataSource,
    private readonly paginationService: PaginationService,
  ) {
    super(AuditLog, dataSource.createEntityManager());
  }

  async insertLog(input: CreateAuditLogInput): Promise<AuditLog> {
    return this.save(
      this.create({
        id: generateSnowflakeId(),
        created_at: new Date(),
        ...input,
      }),
    );
  }

  async findPaginated(
    query: AuditLogQueryDto,
  ): Promise<PaginatedResult<AuditLog>> {
    const qb = this.createQueryBuilder('audit_log');
    const mergedQuery = mergeConvenienceFilters(query);

    const options = buildTypeOrmPaginationOptions<AuditLog, AuditLog>(
      mergedQuery,
      {
        searchFields: [
          'audit_log.user_name',
          'audit_log.description',
          'audit_log.entity_type',
          'audit_log.entity_id',
          'audit_log.action',
        ],
        allowedSortFields: [
          'created_at',
          'action',
          'entity_type',
          'user_name',
        ],
        defaultSort: { created_at: 'DESC' },
      },
    );

    const response = await this.paginationService.paginateQueryBuilder(
      qb,
      'audit_log',
      options,
    );
    return toPaginatedResult(response);
  }

  /**
   * Latest CREATE/UPDATE snapshot for an entity — used to recover denormalized
   * fields (e.g. charge_category_id) that are not stored on the entity row.
   */
  async findLatestEntityDetailSnapshot(
    entityType: string,
    entityId: string,
  ): Promise<Record<string, unknown> | null> {
    const row = await this.createQueryBuilder('audit_log')
      .where('audit_log.entity_type = :entityType', { entityType })
      .andWhere('audit_log.entity_id = :entityId', { entityId })
      .andWhere('audit_log.action IN (:...actions)', {
        actions: ['CREATE', 'UPDATE'],
      })
      .orderBy('audit_log.created_at', 'DESC')
      .getOne();

    if (!row) return null;
    const snap = row.after ?? row.before;
    if (!snap || typeof snap !== 'object' || Array.isArray(snap)) return null;
    return snap as Record<string, unknown>;
  }
}
