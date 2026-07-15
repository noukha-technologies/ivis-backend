import { Injectable } from '@nestjs/common';

import { AppLogger } from '../../../common/logger/app.logger';
import { getAuditContext } from '../../../common/audit/audit-context';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../common/interfaces/pagination.interface';
import {
  AuditLogDao,
  CreateAuditLogInput,
} from '../../database/dao/audit-log.dao';
import {
  AuditActionValue,
  AuditLog,
} from '../../database/entity/audit-log.entity';

export type ExplicitAuditLogInput = {
  action: AuditActionValue;
  description: string;
  userId?: string | null;
  userName?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
};

@Injectable()
export class AuditService {
  constructor(
    private readonly auditLogDao: AuditLogDao,
    private readonly logger: AppLogger,
  ) {}

  async findAll(
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<Omit<AuditLog, 'ip_address'>>> {
    const result = await this.auditLogDao.findPaginated(query);
    return {
      ...result,
      data: result.data.map(({ ip_address: _ip, ...row }) => row),
    };
  }

  async log(input: ExplicitAuditLogInput): Promise<void> {
    try {
      const ctx = getAuditContext();
      const payload: CreateAuditLogInput = {
        user_id: input.userId ?? ctx?.userId ?? null,
        user_name: input.userName ?? ctx?.userName ?? null,
        action: input.action,
        entity_type: input.entityType ?? null,
        entity_id: input.entityId ?? null,
        description: input.description,
        ip_address: input.ipAddress ?? ctx?.ipAddress ?? null,
        user_agent: input.userAgent ?? ctx?.userAgent ?? null,
        before: input.before ?? null,
        after: input.after ?? null,
      };
      await this.auditLogDao.insertLog(payload);
    } catch (error) {
      this.logger.warn(
        `Failed to write explicit audit log (${input.action}): ${
          error instanceof Error ? error.message : String(error)
        }`,
        'AuditService',
      );
    }
  }
}
