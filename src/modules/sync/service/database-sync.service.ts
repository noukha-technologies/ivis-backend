import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  Between,
  DataSource,
  EntityManager,
  EntityTarget,
  ObjectLiteral,
  QueryFailedError,
  TableColumn,
} from 'typeorm';
import { TableUtils } from 'typeorm/schema-builder/util/TableUtils';

import { AppLogger } from '../../../common/logger/app.logger';
import { OnboardingStatusDao } from '../../database/dao/onboarding-status.dao';
import { SyncStateDao } from '../../database/dao/sync-state.dao';
import { CentralSyncReaderService } from '../../onboarding/service/central-sync-reader.service';
import { CentralSyncWriterService } from './central-sync-writer.service';
import { upsertWithUpdate } from '../../../common/utils/conditional-upsert.util';

import { Centre } from '../../database/entity/centre.entity';
import { Line } from '../../database/entity/line.entity';
import { Camera } from '../../database/entity/camera.entity';
import { CameraLineMapping } from '../../database/entity/camera-line-mapping.entity';
import { AdminPc } from '../../database/entity/admin-pc.entity';
import { AdminPcLineMapping } from '../../database/entity/admin-pc-line-mapping.entity';
import { Charge } from '../../database/entity/charge.entity';
import { ChargeCategory } from '../../database/entity/charge-category.entity';
import { Role } from '../../database/entity/role.entity';
import { RoleCentreMapping } from '../../database/entity/role-centre-mapping.entity';
import { Permission } from '../../database/entity/permission.entity';
import { PaymentType } from '../../database/entity/payment-type.entity';
import { Test } from '../../database/entity/test.entity';
import { Vehicle } from '../../database/entity/vehicle.entity';
import { User } from '../../database/entity/user.entity';
import { UserLineMapping } from '../../database/entity/user-line-mapping.entity';
import { Customer } from '../../database/entity/customer.entity';
import { VehicleRecord } from '../../database/entity/vehicle-record.entity';
import { AnprCapture } from '../../database/entity/anpr-capture.entity';
import { RopVerification } from '../../database/entity/rop-verification.entity';
import { Appointment } from '../../database/entity/appointment.entity';
import { Job } from '../../database/entity/job.entity';
import { Payments } from '../../database/entity/payments.entity';

const EPOCH = new Date(0);

export type SyncRunStatus = 'SUCCESS' | 'PARTIAL' | 'FAILED';

export interface SyncRunResult {
  status: SyncRunStatus;
  pulled: Record<string, number>;
  pushed: Record<string, number>;
  error?: string;
}

/**
 * Database Sync engine (ongoing, bidirectional) — separate system from
 * Onboarding Sync (see DATABASE_SYNC_PLAN.md §0). Only ever runs on a
 * centre whose OnboardingStatus is COMPLETED.
 *
 * Cursor granularity is whole-phase, not per-entity: SyncState has exactly
 * one last_pulled_at and one last_pushed_at. If any single entity within
 * the push phase fails, the whole phase's cursor is held back (not just
 * that one entity's) — a deliberate simplification. This is still safe
 * (every upsert here is idempotent — re-pushing/re-pulling already-synced
 * rows on the next run is a no-op or a harmless re-write), it just retries
 * a bit more than the strict minimum on partial failure.
 */
@Injectable()
export class DatabaseSyncService {
  private static readonly context = 'DatabaseSyncService';

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly onboardingStatusDao: OnboardingStatusDao,
    private readonly syncStateDao: SyncStateDao,
    private readonly centralReader: CentralSyncReaderService,
    private readonly centralWriter: CentralSyncWriterService,
    private readonly logger: AppLogger,
  ) {}

  async runSync(): Promise<SyncRunResult> {
    const onboarding = await this.onboardingStatusDao.getStatus();
    if (!onboarding || onboarding.status !== 'COMPLETED' || !onboarding.centre_id) {
      throw new Error(
        'Database Sync can only run once this centre has completed Onboarding Sync.',
      );
    }
    const centreId = onboarding.centre_id;

    const syncState = await this.syncStateDao.ensureSingletonRow();
    const syncStartedAt = new Date();
    const lastPulledAt = syncState.last_pulled_at ?? EPOCH;
    const lastPushedAt = syncState.last_pushed_at ?? EPOCH;

    const result: SyncRunResult = { status: 'SUCCESS', pulled: {}, pushed: {} };
    let pullOk = true;
    let pushOk = true;

    try {
      await this.pullPhase(centreId, lastPulledAt, result);
    } catch (error) {
      pullOk = false;
      result.error = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Database Sync pull phase failed for centre ${centreId}: ${result.error}`,
        error instanceof Error ? error.stack : undefined,
        DatabaseSyncService.context,
      );
    }

    try {
      await this.pushPhase(centreId, lastPushedAt, syncStartedAt, result);
    } catch (error) {
      pushOk = false;
      const message = error instanceof Error ? error.message : String(error);
      result.error = result.error ? `${result.error}; ${message}` : message;
      this.logger.error(
        `Database Sync push phase failed for centre ${centreId}: ${message}`,
        error instanceof Error ? error.stack : undefined,
        DatabaseSyncService.context,
      );
    }

    result.status = pullOk && pushOk ? 'SUCCESS' : pullOk || pushOk ? 'PARTIAL' : 'FAILED';

    await this.syncStateDao.advance(syncState.id, {
      ...(pullOk ? { last_pulled_at: syncStartedAt } : {}),
      ...(pushOk ? { last_pushed_at: syncStartedAt } : {}),
      last_sync_status: result.status,
      last_error: result.error ?? null,
    });

    this.logger.log(
      `Database Sync run for centre ${centreId}: ${result.status} — pulled ${JSON.stringify(result.pulled)}, pushed ${JSON.stringify(result.pushed)}`,
      DatabaseSyncService.context,
    );

    return result;
  }

  private static readonly POSTGRES_UNDEFINED_COLUMN = '42703';

  /**
   * Wraps a single upsert attempt. If it fails specifically because Postgres
   * reports a missing column (42703), adds that column — typed from the
   * entity's own TypeORM metadata, so it matches what a real migration would
   * have created — and retries the upsert exactly once. Any other failure
   * (or a second failure after healing) propagates unchanged, which — inside
   * pullPhase's whole-phase transaction — rolls back the entire pull run, by
   * design (see DATABASE_SYNC_HARDENING_PLAN.md). Renamed/type-changed
   * columns are deliberately not handled here: there's no safe, unambiguous
   * auto-fix to infer for those, so they still fail loudly.
   */
  private async withMissingColumnHealing<T>(
    manager: EntityManager,
    entity: EntityTarget<ObjectLiteral>,
    label: string,
    attempt: () => Promise<T>,
  ): Promise<T> {
    try {
      return await attempt();
    } catch (error) {
      if (
        !(error instanceof QueryFailedError) ||
        (error as { code?: string }).code !==
          DatabaseSyncService.POSTGRES_UNDEFINED_COLUMN
      ) {
        throw error;
      }

      const missingColumnName = (error as { column?: string }).column;
      const metadata = manager.connection.getMetadata(entity);
      const columnMetadata = missingColumnName
        ? metadata.columns.find((c) => c.databaseName === missingColumnName)
        : undefined;
      if (!columnMetadata) {
        // Postgres didn't identify a column, or it's not one this entity
        // declares — nothing safe to heal, rethrow as-is.
        throw error;
      }

      this.logger.warn(
        `⚠ Database Sync: SCHEMA DRIFT — column "${columnMetadata.databaseName}" missing on ` +
          `${metadata.schema}.${metadata.tableName} (entity ${label}). Auto-creating it now from entity ` +
          `metadata and retrying. This should still be reconciled with a real migration — see AlterSchema.ts.`,
        DatabaseSyncService.context,
      );

      const columnOptions = TableUtils.createTableColumnOptions(
        columnMetadata,
        manager.connection.driver,
      );
      await manager.queryRunner!.addColumn(
        `${metadata.schema}.${metadata.tableName}`,
        new TableColumn(columnOptions),
      );

      return await attempt(); // retry once; a second failure propagates untouched
    }
  }

  // ─── PULL PHASE (central → this centre) — one local transaction ─────────

  private async pullPhase(
    centreId: string,
    lastPulledAt: Date,
    result: SyncRunResult,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      // Bucket A — central always wins, unconditional (blind) overwrite.
      const blind = { conditional: false };

      const centres = await this.centralReader.findCentreUpdatedSince(centreId, lastPulledAt);
      result.pulled.Centre = await this.withMissingColumnHealing(manager, Centre, 'Centre', () =>
        upsertWithUpdate(manager, Centre, centres, blind),
      );

      const roles = await this.centralReader.findRolesByCentreIdUpdatedSince(centreId, lastPulledAt);
      const permissionIds = [...new Set(roles.map((r) => r.permission_id).filter(Boolean))];
      const rolePermissions = permissionIds.length
        ? await this.centralReader.findPermissionsByIds(permissionIds)
        : [];
      result.pulled.Permission = await this.withMissingColumnHealing(manager, Permission, 'Permission', () =>
        upsertWithUpdate(manager, Permission, rolePermissions, blind),
      );
      result.pulled.Role = await this.withMissingColumnHealing(manager, Role, 'Role', () =>
        upsertWithUpdate(manager, Role, roles, blind),
      );

      const roleCentreMappings = await this.centralReader.findRoleCentreMappingsByCentreIdUpdatedSince(
        centreId,
        lastPulledAt,
      );
      result.pulled.RoleCentreMapping = await this.withMissingColumnHealing(
        manager,
        RoleCentreMapping,
        'RoleCentreMapping',
        () =>
          upsertWithUpdate(manager, RoleCentreMapping, roleCentreMappings, {
            ...blind,
            conflictColumns: ['role_id', 'centre_id'],
            conflictIndexPredicate: 'is_deleted = false',
          }),
      );

      // Global masters — pulled in full every run (small, low-churn tables).
      const allPermissions = await this.centralReader.findAllPermissionsUpdatedSince(lastPulledAt);
      result.pulled.Permission = (result.pulled.Permission ?? 0) +
        (await this.withMissingColumnHealing(manager, Permission, 'Permission', () =>
          upsertWithUpdate(manager, Permission, allPermissions, blind),
        ));

      const paymentTypes = await this.centralReader.findAllPaymentTypesUpdatedSince(lastPulledAt);
      result.pulled.PaymentType = await this.withMissingColumnHealing(manager, PaymentType, 'PaymentType', () =>
        upsertWithUpdate(manager, PaymentType, paymentTypes, blind),
      );

      const tests = await this.centralReader.findAllTestsUpdatedSince(lastPulledAt);
      result.pulled.Test = await this.withMissingColumnHealing(manager, Test, 'Test', () =>
        upsertWithUpdate(manager, Test, tests, blind),
      );

      // Bucket C — most-recent-`updated_at`-wins, conditional overwrite.
      const conditional = { conditional: true };

      // ChargeCategory pulled before Vehicle/Charge — both have an FK to it
      // (vehicles.charge_category_id, charges.charge_category_id). Pulling
      // it later in the same transaction caused an FK violation whenever an
      // incoming Vehicle/Charge row referenced a category not yet synced
      // this run.
      const chargeCategories = await this.centralReader.findChargeCategoriesUpdatedSince(lastPulledAt);
      result.pulled.ChargeCategory = await this.withMissingColumnHealing(
        manager,
        ChargeCategory,
        'ChargeCategory',
        () => upsertWithUpdate(manager, ChargeCategory, chargeCategories, conditional),
      );

      const vehicles = await this.centralReader.findAllVehiclesUpdatedSince(lastPulledAt);
      result.pulled.Vehicle = await this.withMissingColumnHealing(manager, Vehicle, 'Vehicle', () =>
        upsertWithUpdate(manager, Vehicle, vehicles, blind),
      );

      const lines = await this.centralReader.findLinesByCentreIdUpdatedSince(centreId, lastPulledAt);
      result.pulled.Line = await this.withMissingColumnHealing(manager, Line, 'Line', () =>
        upsertWithUpdate(manager, Line, lines, conditional),
      );
      const lineIds = lines.map((l) => l.id);

      if (lineIds.length) {
        const cameras = await this.centralReader.findCamerasByLineIdsUpdatedSince(lineIds, lastPulledAt);
        result.pulled.Camera = await this.withMissingColumnHealing(manager, Camera, 'Camera', () =>
          upsertWithUpdate(manager, Camera, cameras, conditional),
        );

        const cameraLineMappings = await this.centralReader.findCameraLineMappingsByLineIdsUpdatedSince(
          lineIds,
          lastPulledAt,
        );
        result.pulled.CameraLineMapping = await this.withMissingColumnHealing(
          manager,
          CameraLineMapping,
          'CameraLineMapping',
          () => upsertWithUpdate(manager, CameraLineMapping, cameraLineMappings, conditional),
        );

        const adminPcs = await this.centralReader.findAdminPcsByLineIdsUpdatedSince(lineIds, lastPulledAt);
        result.pulled.AdminPc = await this.withMissingColumnHealing(manager, AdminPc, 'AdminPc', () =>
          upsertWithUpdate(manager, AdminPc, adminPcs, conditional),
        );

        const adminPcLineMappings = await this.centralReader.findAdminPcLineMappingsByLineIdsUpdatedSince(
          lineIds,
          lastPulledAt,
        );
        result.pulled.AdminPcLineMapping = await this.withMissingColumnHealing(
          manager,
          AdminPcLineMapping,
          'AdminPcLineMapping',
          () => upsertWithUpdate(manager, AdminPcLineMapping, adminPcLineMappings, conditional),
        );
      }

      const charges = await this.centralReader.findChargesByCentreIdUpdatedSince(centreId, lastPulledAt);
      result.pulled.Charge = await this.withMissingColumnHealing(manager, Charge, 'Charge', () =>
        upsertWithUpdate(manager, Charge, charges, conditional),
      );

      const users = await this.centralReader.findUsersByCentreIdUpdatedSince(centreId, lastPulledAt);
      result.pulled.User = await this.withMissingColumnHealing(manager, User, 'User', () =>
        upsertWithUpdate(manager, User, users, conditional),
      );
      const userIds = users.map((u) => u.id);

      if (userIds.length) {
        const userLineMappings = await this.centralReader.findUserLineMappingsByUserIdsUpdatedSince(
          userIds,
          lastPulledAt,
        );
        result.pulled.UserLineMapping = await this.withMissingColumnHealing(
          manager,
          UserLineMapping,
          'UserLineMapping',
          () => upsertWithUpdate(manager, UserLineMapping, userLineMappings, conditional),
        );
      }
    });
  }

  // ─── PUSH PHASE (this centre → central) — best-effort per entity ────────

  private async pushPhase(
    centreId: string,
    lastPushedAt: Date,
    syncStartedAt: Date,
    result: SyncRunResult,
  ): Promise<void> {
    const window = Between(lastPushedAt, syncStartedAt);
    const failures: string[] = [];

    // Bucket C — this centre's own rows only, conditional upsert centrally.
    await this.pushEntity(Line, { centre_id: centreId, updated_at: window }, true, 'Line', result, failures);
    await this.pushEntity(Charge, { centre_id: centreId, updated_at: window }, true, 'Charge', result, failures);

    // User: this centre's own rows, EXCLUDING re-scoped Super Admin copies
    // (requires_central_revalidation = true) — see DATABASE_SYNC_PLAN.md
    // §6.1 for why: that row shares the real central Super Admin's PK, and
    // pushing it would overwrite their role_id/center_id centrally.
    await this.pushEntity(
      User,
      { center_id: centreId, requires_central_revalidation: false, updated_at: window },
      true,
      'User',
      result,
      failures,
    );

    // Camera/AdminPc/mappings/ChargeCategory/UserLineMapping don't carry a
    // direct centre_id — push whatever changed locally in this window
    // regardless of which centre "owns" it conceptually; the conditional
    // (most-recent-wins) upsert makes an accidental push from the wrong
    // centre a no-op unless it's genuinely the newer copy.
    await this.pushEntity(Camera, { updated_at: window }, true, 'Camera', result, failures);
    await this.pushEntity(CameraLineMapping, { updated_at: window }, true, 'CameraLineMapping', result, failures);
    await this.pushEntity(AdminPc, { updated_at: window }, true, 'AdminPc', result, failures);
    await this.pushEntity(AdminPcLineMapping, { updated_at: window }, true, 'AdminPcLineMapping', result, failures);
    await this.pushEntity(ChargeCategory, { updated_at: window }, true, 'ChargeCategory', result, failures);
    await this.pushEntity(UserLineMapping, { updated_at: window }, true, 'UserLineMapping', result, failures);

    // Bucket B — pure transactional, no conflicts, plain overwrite centrally.
    await this.pushEntity(Customer, { updated_at: window }, false, 'Customer', result, failures);
    await this.pushEntity(VehicleRecord, { updated_at: window }, false, 'VehicleRecord', result, failures);
    await this.pushEntity(AnprCapture, { updated_at: window }, false, 'AnprCapture', result, failures);
    await this.pushEntity(RopVerification, { updated_at: window }, false, 'RopVerification', result, failures);
    await this.pushEntity(Appointment, { updated_at: window }, false, 'Appointment', result, failures);
    await this.pushEntity(Job, { updated_at: window }, false, 'Job', result, failures);
    await this.pushEntity(Payments, { updated_at: window }, false, 'Payments', result, failures);

    if (failures.length) {
      throw new Error(`push failed for: ${failures.join(', ')}`);
    }
  }

  /**
   * Every entity is attempted regardless of earlier failures — a failure is
   * recorded into `failures` and logged, never thrown from here, so one bad
   * table can never stop the rest of the push phase from running (per
   * DATABASE_SYNC_PLAN.md §5's "best-effort per entity"). pushPhase throws
   * once, after every entity has been attempted, if `failures` is non-empty.
   */
  private async pushEntity<T extends { new (): object }>(
    entity: T,
    where: Record<string, unknown>,
    conditional: boolean,
    label: string,
    result: SyncRunResult,
    failures: string[],
  ): Promise<void> {
    try {
      const repo = this.dataSource.getRepository(entity as never);
      const rows = await repo.find({ where: where as never });
      if (!rows.length) {
        result.pushed[label] = 0;
        return;
      }
      result.pushed[label] = await this.centralWriter.upsert(
        entity as never,
        rows as never[],
        { conditional },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Database Sync push: ${label} failed — ${message}`,
        DatabaseSyncService.context,
      );
      failures.push(label);
    }
  }
}
