import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../common/interfaces/pagination.interface';
import {
  buildTypeOrmPaginationOptions,
  toPaginatedResult,
} from '../../../common/shared/pagination/pagination-query.util';
import { PaginationService } from '../../../common/shared/pagination/pagination.service';
import { generateSnowflakeId } from '../../../common/shared/snowflakeIdGeneration';
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
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<AuditLog>> {
    const qb = this.createQueryBuilder('audit_log');

    const options = buildTypeOrmPaginationOptions<AuditLog, AuditLog>(query, {
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
    });

    const response = await this.paginationService.paginateQueryBuilder(
      qb,
      'audit_log',
      options,
    );
    return toPaginatedResult(response);
  }
}
