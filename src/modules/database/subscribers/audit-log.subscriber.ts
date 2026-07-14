import { Injectable } from '@nestjs/common';
import {
  DataSource,
  EntitySubscriberInterface,
  EventSubscriber,
  InsertEvent,
  RemoveEvent,
  UpdateEvent,
} from 'typeorm';

import { AppLogger } from '../../../common/logger/app.logger';
import { getAuditContext } from '../../../common/audit/audit-context';
import {
  buildActionDescription,
  resolveEntityId,
  scrubSensitiveFields,
} from '../../../common/audit/audit-scrub.util';
import { AuditLogDao } from '../dao/audit-log.dao';
import { AuditActionValue } from '../entity/audit-log.entity';

@EventSubscriber()
@Injectable()
export class AuditLogSubscriber implements EntitySubscriberInterface {
  constructor(
    dataSource: DataSource,
    private readonly auditLogDao: AuditLogDao,
    private readonly logger: AppLogger,
  ) {
    dataSource.subscribers.push(this);
  }

  afterInsert(event: InsertEvent<unknown>): void {
    void this.safeWrite(event.metadata.name, 'CREATE', undefined, event.entity);
  }

  afterUpdate(event: UpdateEvent<unknown>): void {
    const before = event.databaseEntity as Record<string, unknown> | undefined;
    const after = event.entity as Record<string, unknown> | undefined;
    const action = this.resolveUpdateAction(before, after);
    void this.safeWrite(event.metadata.name, action, before, after);
  }

  afterRemove(event: RemoveEvent<unknown>): void {
    void this.safeWrite(
      event.metadata.name,
      'DELETE',
      event.databaseEntity ?? event.entity,
      undefined,
    );
  }

  private resolveUpdateAction(
    before: Record<string, unknown> | undefined,
    after: Record<string, unknown> | undefined,
  ): AuditActionValue {
    const wasDeleted = before?.is_deleted === true;
    const isDeleted = after?.is_deleted === true;
    if (!wasDeleted && isDeleted) {
      return 'DELETE';
    }
    if (wasDeleted && !isDeleted) {
      return 'RESTORE';
    }
    return 'UPDATE';
  }

  private async safeWrite(
    entityName: string,
    action: AuditActionValue,
    before: unknown,
    after: unknown,
  ): Promise<void> {
    if (entityName === 'AuditLog' || entityName === 'audit_logs') {
      return;
    }

    try {
      const ctx = getAuditContext();
      const beforeScrubbed = scrubSensitiveFields(before);
      const afterScrubbed = scrubSensitiveFields(after);
      const entityRecord =
        (after as Record<string, unknown> | undefined) ??
        (before as Record<string, unknown> | undefined);

      await this.auditLogDao.insertLog({
        user_id: ctx?.userId ?? null,
        user_name: ctx?.userName ?? null,
        action,
        entity_type: entityName,
        entity_id: resolveEntityId(entityRecord),
        description: buildActionDescription(action, entityName),
        ip_address: ctx?.ipAddress ?? null,
        user_agent: ctx?.userAgent ?? null,
        before: beforeScrubbed,
        after: afterScrubbed,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to write audit log for ${action} ${entityName}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        'AuditLogSubscriber',
      );
    }
  }
}
