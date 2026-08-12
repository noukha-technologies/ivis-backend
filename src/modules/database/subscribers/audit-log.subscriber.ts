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
import { takeAuditEntityDetails } from '../../../common/audit/audit-entity-details.stash';
import {
  buildActionDescription,
  markSensitiveFieldChanges,
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
    // Merge denormalized audit fields synchronously here. Services clear
    // ALS details in `finally` after save(); an async merge would race and
    // drop customer_name / plate / etc.
    const entityName = event.metadata.name;
    const ctx = getAuditContext();
    const entityId = resolveEntityId(
      event.entity as Record<string, unknown> | undefined,
    );
    const stashed = takeAuditEntityDetails(entityName, entityId);
    const merged = this.mergeAppointmentAuditSnapshots(
      entityName,
      undefined,
      event.entity,
      ctx,
      stashed,
    );
    void this.safeWrite(
      entityName,
      'CREATE',
      merged.before,
      merged.after,
      ctx,
      true,
    );
  }

  afterUpdate(event: UpdateEvent<unknown>): void {
    let before = event.databaseEntity as Record<string, unknown> | undefined;
    let after = event.entity;
    if (this.isCameraHealthOnlyUpdate(event.metadata.name, before, after)) {
      return;
    }
    const ctx = getAuditContext();
    if (ctx?.suppressAnprCaptureAudit) {
      return;
    }
    if (this.isAnprCaptureBackgroundUpdate(event, before, after, ctx)) {
      return;
    }
    this.enrichVirtualLineIds(before, after);
    this.enrichAppointmentAuditDetails(before, after);

    const passwordColumnUpdated = (event.updatedColumns ?? []).some(
      (col) => col.propertyName === 'password',
    );
    const passwordChanged =
      passwordColumnUpdated || Boolean(getAuditContext()?.passwordChanged);

    if (passwordChanged) {
      // Force distinct raw markers so scrubbing stores Password as changed.
      // (Both real values would scrub to the same "[REDACTED]" otherwise.)
      if (!after) {
        after = { ...(before ?? {}), id: before?.id };
      }
      if (!before) {
        before = {};
      }
      before.password = before.password ? '__had_password__' : null;
      after.password = '__new_password__';
    }

    const action = this.resolveUpdateAction(before, after);
    const entityName = event.metadata.name;
    const entityId = resolveEntityId(after ?? before);
    const stashed = takeAuditEntityDetails(entityName, entityId);
    const merged = this.mergeAppointmentAuditSnapshots(
      entityName,
      before,
      after,
      ctx,
      stashed,
    );
    void this.safeWrite(
      entityName,
      action,
      merged.before,
      merged.after,
      ctx,
      true,
    );
  }

  /**
   * line_ids is a virtual field (from mappings, not a DB column). The DB
   * "before" snapshot is often empty even when the line did not change.
   */
  private enrichVirtualLineIds(
    before?: Record<string, unknown>,
    after?: Record<string, unknown>,
  ): void {
    if (!before || !after) {
      return;
    }
    const auditBefore = after.__auditLineIdsBefore;
    if (auditBefore !== undefined && !before.line_ids) {
      before.line_ids = auditBefore;
    }
    delete after.__auditLineIdsBefore;
    delete before.lines;
    delete after.lines;
    delete before.lineMappings;
    delete after.lineMappings;
  }

  /**
   * Appointment detail fields (owner, plate, …) are denormalized onto the
   * entity for audit only. Copy the before snapshot so UPDATE diffs stay accurate.
   */
  private enrichAppointmentAuditDetails(
    before?: Record<string, unknown>,
    after?: Record<string, unknown>,
  ): void {
    if (!after) {
      return;
    }
    const detailBefore = after.__auditDetailBefore;
    if (
      before &&
      detailBefore &&
      typeof detailBefore === 'object' &&
      !Array.isArray(detailBefore)
    ) {
      Object.assign(before, detailBefore);
    }
    delete after.__auditDetailBefore;
  }

  /**
   * Automatic camera health pings only touch these columns — never audit them
   * as user "Updated Camera" actions.
   */
  private isCameraHealthOnlyUpdate(
    entityName: string,
    before?: Record<string, unknown>,
    after?: Record<string, unknown>,
  ): boolean {
    if (entityName !== 'Camera') {
      return false;
    }
    const healthKeys = new Set([
      'health_status',
      'is_online',
      'last_health_check',
      'last_seen_at',
      'updated_at',
    ]);
    const keys = new Set([
      ...Object.keys(before ?? {}),
      ...Object.keys(after ?? {}),
    ]);
    // QueryBuilder AfterUpdate may only pass the valuesSet as "entity".
    if (!before && after) {
      const afterKeys = Object.keys(after).filter((k) => k !== 'id');
      return afterKeys.length > 0 && afterKeys.every((k) => healthKeys.has(k));
    }
    if (!before || !after) {
      return false;
    }
    const changed = [...keys].filter(
      (key) =>
        JSON.stringify(before[key]) !== JSON.stringify(after[key]) &&
        key !== 'line_ids' &&
        key !== 'lines' &&
        key !== 'lineMappings',
    );
    return changed.length > 0 && changed.every((key) => healthKeys.has(key));
  }

  /**
   * After create, the UI uploads images and the ROP pipeline may auto-validate
   * the capture — neither is a user "edit". Skip those background UPDATE rows
   * unless the service stashed explicit audit before/after details.
   */
  private isAnprCaptureBackgroundUpdate(
    event: UpdateEvent<unknown>,
    before?: Record<string, unknown>,
    after?: Record<string, unknown>,
    ctx?: ReturnType<typeof getAuditContext>,
  ): boolean {
    if (event.metadata.name !== 'AnprCapture') {
      return false;
    }
    if (ctx?.anprCaptureAuditDetails || ctx?.anprCaptureAuditDetailsBefore) {
      return false;
    }

    const backgroundCols = new Set([
      'image_url',
      'scene_image_url',
      'status',
      'rop_verification_id',
      'updated_at',
    ]);
    const updatedColNames = (event.updatedColumns ?? []).map(
      (col) => col.propertyName,
    );
    if (updatedColNames.length > 0) {
      return updatedColNames.every((name) => backgroundCols.has(name));
    }

    const backgroundKeys = new Set([
      ...backgroundCols,
      'currentRopVerification',
    ]);
    const keys = new Set([
      ...Object.keys(before ?? {}),
      ...Object.keys(after ?? {}),
    ]);
    if (!before && after) {
      const afterKeys = Object.keys(after).filter((k) => k !== 'id');
      return (
        afterKeys.length > 0 && afterKeys.every((k) => backgroundKeys.has(k))
      );
    }
    if (!before || !after) {
      return false;
    }
    const changed = [...keys].filter(
      (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]),
    );
    return (
      changed.length > 0 && changed.every((key) => backgroundKeys.has(key))
    );
  }

  afterRemove(event: RemoveEvent<unknown>): void {
    const entityName = event.metadata.name;
    const ctx = getAuditContext();
    const entityId = resolveEntityId(
      (event.entity as Record<string, unknown> | undefined) ??
        (event.databaseEntity as Record<string, unknown> | undefined),
    );
    const stashed = takeAuditEntityDetails(entityName, entityId);
    const merged = this.mergeAppointmentAuditSnapshots(
      entityName,
      event.databaseEntity ?? event.entity,
      undefined,
      ctx,
      stashed,
    );
    void this.safeWrite(
      entityName,
      'DELETE',
      merged.before,
      merged.after,
      ctx,
      true,
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
    ctxSnapshot?: ReturnType<typeof getAuditContext>,
    alreadyMerged = false,
  ): Promise<void> {
    if (
      entityName === 'AuditLog' ||
      entityName === 'audit_logs' ||
      entityName === 'CameraLineMapping' ||
      entityName === 'AdminPcLineMapping'
    ) {
      return;
    }

    // Defense in depth: QueryBuilder health pings look like this exact shape.
    if (
      action === 'UPDATE' &&
      this.isCameraHealthOnlyUpdate(
        entityName,
        before as Record<string, unknown> | undefined,
        after as Record<string, unknown> | undefined,
      )
    ) {
      return;
    }

    try {
      // Prefer the sync-captured context; ALS may already be cleared by the
      // service `finally` by the time this async write resumes.
      const ctx = ctxSnapshot ?? getAuditContext();
      const merged = alreadyMerged
        ? { before, after }
        : this.mergeAppointmentAuditSnapshots(entityName, before, after, ctx);
      const beforeScrubbed = scrubSensitiveFields(merged.before);
      const afterScrubbed = scrubSensitiveFields(merged.after);
      const marked = markSensitiveFieldChanges(
        beforeScrubbed,
        afterScrubbed,
        merged.before,
        merged.after,
      );
      const entityRecord =
        (merged.after as Record<string, unknown> | undefined) ??
        (merged.before as Record<string, unknown> | undefined);

      await this.auditLogDao.insertLog({
        user_id: ctx?.userId ?? null,
        user_name: ctx?.userName ?? null,
        action,
        entity_type: entityName,
        entity_id: resolveEntityId(entityRecord),
        description: buildActionDescription(action, entityName),
        ip_address: ctx?.ipAddress ?? null,
        user_agent: ctx?.userAgent ?? null,
        before: marked.before,
        after: marked.after,
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

  /**
   * Walk-in / Job detail fields that are not table columns.
   * Services stash them on the request audit context so CREATE/UPDATE/DELETE
   * snapshots include the form/list data users expect in the log panel.
   */
  private mergeAppointmentAuditSnapshots(
    entityName: string,
    before: unknown,
    after: unknown,
    ctx: ReturnType<typeof getAuditContext>,
    stashed?: {
      after?: Record<string, unknown> | null;
      before?: Record<string, unknown> | null;
    } | null,
  ): { before: unknown; after: unknown } {
    let details: Record<string, unknown> | null | undefined;
    let detailsBefore: Record<string, unknown> | null | undefined;

    if (entityName === 'Appointment') {
      details = ctx?.appointmentAuditDetails;
      detailsBefore = ctx?.appointmentAuditDetailsBefore;
    } else if (entityName === 'Job') {
      details = ctx?.jobAuditDetails;
      detailsBefore = ctx?.jobAuditDetailsBefore;
    } else if (entityName === 'Payments') {
      details = ctx?.paymentsAuditDetails;
      detailsBefore = ctx?.paymentsAuditDetailsBefore;
    } else if (entityName === 'User') {
      details = ctx?.userAuditDetails;
      detailsBefore = ctx?.userAuditDetailsBefore;
    } else if (entityName === 'Role') {
      details = ctx?.roleAuditDetails;
      detailsBefore = ctx?.roleAuditDetailsBefore;
    } else if (entityName === 'AnprCapture') {
      details = ctx?.anprCaptureAuditDetails;
      detailsBefore = ctx?.anprCaptureAuditDetailsBefore;
    } else if (entityName === 'RopVerification') {
      details = ctx?.ropVerificationAuditDetails;
      detailsBefore = ctx?.ropVerificationAuditDetailsBefore;
    } else if (!stashed?.after && !stashed?.before) {
      return { before, after };
    }

    // Entity-id stash wins over ALS (survives finally-clear / ALS gaps).
    // Skip null/empty values so a thin before-stash cannot wipe good IDs/names.
    const preserveNullImageKeys = new Set(['image_url', 'scene_image_url']);
    const compact = (src: Record<string, unknown>) =>
      Object.fromEntries(
        Object.entries(src).filter(
          ([key, v]) =>
            preserveNullImageKeys.has(key) ||
            (v !== null && v !== undefined && v !== ''),
        ),
      );

    if (stashed?.after) {
      details = { ...(details ?? {}), ...compact(stashed.after) };
    }
    if (stashed?.before) {
      detailsBefore = { ...(detailsBefore ?? {}), ...compact(stashed.before) };
    }
    if (details) details = compact(details);
    if (detailsBefore) detailsBefore = compact(detailsBefore);

    if (!details && !detailsBefore) {
      return { before, after };
    }

    let nextBefore = before;
    let nextAfter = after;

    if (detailsBefore) {
      nextBefore = {
        ...((typeof before === 'object' && before !== null
          ? before
          : {}) as Record<string, unknown>),
        ...detailsBefore,
      };
    }

    if (details) {
      nextAfter = {
        ...((typeof after === 'object' && after !== null
          ? after
          : {}) as Record<string, unknown>),
        ...details,
      };
      // Soft-delete: also fill before if before-snapshot was not provided.
      if (!detailsBefore && before && typeof before === 'object') {
        nextBefore = {
          ...(before as Record<string, unknown>),
          ...details,
        };
      }
    }

    return { before: nextBefore, after: nextAfter };
  }
}
