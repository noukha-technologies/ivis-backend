import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import {
  DataSource,
  EntityManager,
  EntityTarget,
  ObjectLiteral,
} from 'typeorm';

import { AppLogger } from '../../../common/logger/app.logger';
import { OnboardingStatusDao } from '../../database/dao/onboarding-status.dao';
import { CentralSyncReaderService } from './central-sync-reader.service';
import { User } from '../../database/entity/user.entity';
import { Centre } from '../../database/entity/centre.entity';
import { Line } from '../../database/entity/line.entity';
import { Camera } from '../../database/entity/camera.entity';
import { CameraLineMapping } from '../../database/entity/camera-line-mapping.entity';
import { AdminPc } from '../../database/entity/admin-pc.entity';
import { AdminPcLineMapping } from '../../database/entity/admin-pc-line-mapping.entity';
import { Configurations } from '../../database/entity/configuration.entity';
import { Charge } from '../../database/entity/charge.entity';
import { ChargeCategory } from '../../database/entity/charge-category.entity';
import { Role } from '../../database/entity/role.entity';
import { Permission } from '../../database/entity/permission.entity';
import { UserLineMapping } from '../../database/entity/user-line-mapping.entity';

const CONFIRMATION_TTL_MS = 10 * 60 * 1000; // 10 minutes — see plan's Known limitations.
// If a sync claims IN_PROGRESS but the process crashes/restarts mid-transaction
// (Postgres rolls the transaction back — no partial data), nothing ever runs
// the catch block that would mark it FAILED, so the row would otherwise be
// stuck IN_PROGRESS forever. Treat it as stale past this window and let the
// next login attempt restart the handshake from scratch.
const STALE_SYNC_MS = 2 * 60 * 1000; // 2 minutes — matches the frontend retry cap.

export type EnsureOnboardedResult =
  | { status: 'COMPLETED' }
  | { status: 'IN_PROGRESS' }
  | {
      status: 'CONFIRMATION_REQUIRED';
      centre: { id: string; name: string; code: string };
    }
  | { status: 'CENTRE_MISMATCH' }
  | { status: 'FAILED'; error: string };

@Injectable()
export class OnboardingService {
  constructor(
    private readonly onboardingStatusDao: OnboardingStatusDao,
    private readonly centralReader: CentralSyncReaderService,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly logger: AppLogger,
  ) {}

  async findCentralUserWithPassword(email: string): Promise<User | null> {
    return this.centralReader.findUserByEmailWithPassword(email);
  }

  async verifyCentralPassword(
    user: User,
    password: string,
  ): Promise<boolean> {
    if (!user.password) return false;
    return bcrypt.compare(password, user.password);
  }

  /**
   * Drives the onboarding state machine for one login attempt. Every state
   * transition goes through OnboardingStatusDao.tryClaim — a DB-level atomic
   * conditional UPDATE — so concurrent logins can never double-sync.
   */
  async ensureOnboarded(
    centralUser: User,
    confirmOnboarding: boolean,
  ): Promise<EnsureOnboardedResult> {
    if (!centralUser.center_id) {
      // Global/system central users don't participate in this flow.
      return { status: 'FAILED', error: 'User has no centre assignment' };
    }
    const centreId = centralUser.center_id;

    let status = await this.onboardingStatusDao.ensureSingletonRow();

    if (
      status.status === 'PENDING_CONFIRMATION' &&
      status.confirmation_expires_at &&
      status.confirmation_expires_at.getTime() < Date.now()
    ) {
      await this.onboardingStatusDao.tryClaim(
        status.id,
        ['PENDING_CONFIRMATION'],
        'PENDING',
        { centre_id: null, centre_code: null, confirmation_expires_at: null },
      );
      status = (await this.onboardingStatusDao.getStatus())!;
    }

    if (
      status.status === 'IN_PROGRESS' &&
      Date.now() - status.updated_at.getTime() > STALE_SYNC_MS
    ) {
      this.logger.warn(
        `Onboarding sync for centre ${status.centre_id} appears stuck IN_PROGRESS (no update in over ${STALE_SYNC_MS}ms) — reverting to PENDING so the next login can retry.`,
        'OnboardingService',
      );
      await this.onboardingStatusDao.tryClaim(
        status.id,
        ['IN_PROGRESS'],
        'PENDING',
        { centre_id: null, centre_code: null, confirmation_expires_at: null },
      );
      status = (await this.onboardingStatusDao.getStatus())!;
    }

    if (status.centre_id && status.centre_id !== centreId) {
      return { status: 'CENTRE_MISMATCH' };
    }

    if (status.status === 'COMPLETED') {
      return { status: 'COMPLETED' };
    }

    if (status.status === 'IN_PROGRESS') {
      return { status: 'IN_PROGRESS' };
    }

    if (status.status === 'PENDING_CONFIRMATION') {
      if (!confirmOnboarding) {
        return {
          status: 'CONFIRMATION_REQUIRED',
          centre: await this.resolveCentreInfo(status.centre_id!),
        };
      }
      return this.confirmAndSync(status.id, centreId);
    }

    // status.status === 'PENDING' (fresh, or just reverted from an expiry)
    const centre = await this.centralReader.findCentreById(centreId);
    if (!centre) {
      return { status: 'FAILED', error: 'Centre not found centrally' };
    }

    const claimed = await this.onboardingStatusDao.tryClaim(
      status.id,
      ['PENDING'],
      'PENDING_CONFIRMATION',
      {
        centre_id: centre.id,
        centre_code: centre.code,
        confirmation_expires_at: new Date(Date.now() + CONFIRMATION_TTL_MS),
      },
    );

    if (!claimed) {
      // Lost the race to another concurrent request — re-read and react.
      const fresh = await this.onboardingStatusDao.getStatus();
      if (fresh?.status === 'IN_PROGRESS') {
        return { status: 'IN_PROGRESS' };
      }
      return {
        status: 'CONFIRMATION_REQUIRED',
        centre: { id: centre.id, name: centre.name, code: centre.code },
      };
    }

    if (confirmOnboarding) {
      // Caller already sent confirmOnboarding=true on this very first hit.
      return this.confirmAndSync(status.id, centreId);
    }

    return {
      status: 'CONFIRMATION_REQUIRED',
      centre: { id: centre.id, name: centre.name, code: centre.code },
    };
  }

  private async resolveCentreInfo(
    centreId: string,
  ): Promise<{ id: string; name: string; code: string }> {
    const centre = await this.centralReader.findCentreById(centreId);
    return { id: centreId, name: centre?.name ?? '', code: centre?.code ?? '' };
  }

  private async confirmAndSync(
    statusId: string,
    centreId: string,
  ): Promise<EnsureOnboardedResult> {
    const claimed = await this.onboardingStatusDao.tryClaim(
      statusId,
      ['PENDING_CONFIRMATION'],
      'IN_PROGRESS',
    );
    if (!claimed) {
      const fresh = await this.onboardingStatusDao.getStatus();
      if (fresh?.status === 'COMPLETED') return { status: 'COMPLETED' };
      return { status: 'IN_PROGRESS' };
    }

    try {
      await this.syncCentreScopedData(centreId);
      await this.onboardingStatusDao.tryClaim(
        statusId,
        ['IN_PROGRESS'],
        'COMPLETED',
        { data_synced_at: new Date() },
      );
      return { status: 'COMPLETED' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Onboarding sync failed for centre ${centreId}: ${message}`,
        error instanceof Error ? error.stack : undefined,
        'OnboardingService',
      );
      await this.onboardingStatusDao.markFailed(statusId, message);
      return { status: 'FAILED', error: message };
    }
  }

  /**
   * FK-dependency-ordered copy, one local transaction (rollback-safe on any
   * failure). Reads are all against the read-only 'central' connection;
   * writes go through this transaction's own EntityManager, not the app's
   * normal DAOs (whose Repository instances aren't scoped to this
   * transaction) — required for the "all or nothing" guarantee.
   */
  private async syncCentreScopedData(centreId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const centre = await this.centralReader.findCentreById(centreId);
      if (!centre) {
        throw new Error('Centre not found centrally during sync');
      }
      await this.upsertRows(manager, Centre, [centre]);

      const lines = await this.centralReader.findLinesByCentreId(centreId);
      await this.upsertRows(manager, Line, lines);
      const lineIds = lines.map((line) => line.id);
      this.logger.log(
        `Onboarding sync (centre ${centreId}): ${lines.length} lines`,
        'OnboardingService',
      );

      const cameraLineMappings =
        await this.centralReader.findCameraLineMappingsByLineIds(lineIds);
      const cameraIds = [
        ...new Set(cameraLineMappings.map((m) => m.camera_id)),
      ];
      const cameras = await this.centralReader.findCamerasByIds(cameraIds);
      await this.upsertRows(manager, Camera, cameras);
      await this.upsertRows(manager, CameraLineMapping, cameraLineMappings);
      this.logger.log(
        `Onboarding sync (centre ${centreId}): ${cameras.length} cameras, ${cameraLineMappings.length} camera-line mappings`,
        'OnboardingService',
      );

      const adminPcLineMappings =
        await this.centralReader.findAdminPcLineMappingsByLineIds(lineIds);
      const adminPcIds = [
        ...new Set(adminPcLineMappings.map((m) => m.admin_pc_id)),
      ];
      const adminPcs = await this.centralReader.findAdminPcsByIds(adminPcIds);
      await this.upsertRows(manager, AdminPc, adminPcs);
      await this.upsertRows(manager, AdminPcLineMapping, adminPcLineMappings);
      this.logger.log(
        `Onboarding sync (centre ${centreId}): ${adminPcs.length} admin PCs, ${adminPcLineMappings.length} admin PC-line mappings`,
        'OnboardingService',
      );

      const configurations =
        await this.centralReader.findConfigurationsByCentreId(centreId);
      await this.upsertRows(manager, Configurations, configurations);

      const charges = await this.centralReader.findChargesByCentreId(
        centreId,
      );
      const chargeCategoryIds = [
        ...new Set(
          charges
            .map((c) => c.charge_category_id)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      const chargeCategories =
        await this.centralReader.findChargeCategoriesByIds(
          chargeCategoryIds,
        );
      await this.upsertRows(manager, ChargeCategory, chargeCategories);
      await this.upsertRows(manager, Charge, charges);
      this.logger.log(
        `Onboarding sync (centre ${centreId}): ${charges.length} charges, ${chargeCategories.length} charge categories`,
        'OnboardingService',
      );

      const roles = await this.centralReader.findRolesByCentreId(centreId);
      const permissionIds = [
        ...new Set(roles.map((r) => r.permission_id).filter(Boolean)),
      ];
      const permissions = await this.centralReader.findPermissionsByIds(
        permissionIds,
      );
      await this.upsertRows(manager, Permission, permissions);
      await this.upsertRows(manager, Role, roles);
      this.logger.log(
        `Onboarding sync (centre ${centreId}): ${roles.length} roles, ${permissions.length} permissions`,
        'OnboardingService',
      );

      const users = await this.centralReader.findUsersByCentreId(centreId);
      const centreOwnedRoleIds = new Set(roles.map((r) => r.id));
      const missingRoleIds = [
        ...new Set(
          users
            .map((u) => u.role_id)
            .filter((id) => id && !centreOwnedRoleIds.has(id)),
        ),
      ];
      if (missingRoleIds.length) {
        // On-demand top-up: a user's role isn't always centre-owned — copy
        // it (and its Permission dependency) regardless, before inserting
        // the user, so its role_id FK always resolves locally.
        const topUpRoles = await this.centralReader.findRolesByIds(
          missingRoleIds,
        );

        // A non-centre-owned role can belong to a DIFFERENT centre (its own
        // center_id FK) — that centre was never synced (only `centreId` was),
        // so Role's FK_roles_center_id would violate on insert unless that
        // owning Centre row is copied too. Same copy-on-demand treatment as
        // Permission, one level deeper.
        await this.upsertForeignCentres(
          manager,
          topUpRoles.map((r) => r.center_id),
          centreId,
          'roles',
        );

        const topUpPermissionIds = [
          ...new Set(topUpRoles.map((r) => r.permission_id).filter(Boolean)),
        ];
        const topUpPermissions =
          await this.centralReader.findPermissionsByIds(topUpPermissionIds);
        await this.upsertRows(manager, Permission, topUpPermissions);
        await this.upsertRows(manager, Role, topUpRoles);
        this.logger.log(
          `Onboarding sync (centre ${centreId}): top-up ${topUpRoles.length} non-centre-owned roles referenced by synced users`,
          'OnboardingService',
        );
      }
      await this.upsertRows(manager, User, users);
      this.logger.log(
        `Onboarding sync (centre ${centreId}): ${users.length} users`,
        'OnboardingService',
      );

      const userIds = users.map((u) => u.id);
      const userLineMappings =
        await this.centralReader.findUserLineMappingsByUserIds(userIds);

      // A user can be mapped to a line owned by a DIFFERENT centre than the
      // one being onboarded — that Line (and, in turn, its own owning Centre)
      // was never synced (only `lineIds` for `centreId` were). Same
      // copy-on-demand treatment as the Role/Centre gap above.
      const syncedLineIds = new Set(lineIds);
      const missingLineIds = [
        ...new Set(
          userLineMappings
            .map((m) => m.line_id)
            .filter((id) => id && !syncedLineIds.has(id)),
        ),
      ];
      if (missingLineIds.length) {
        const topUpLines = await this.centralReader.findLinesByIds(
          missingLineIds,
        );
        await this.upsertForeignCentres(
          manager,
          topUpLines.map((l) => l.centre_id),
          centreId,
          'lines',
        );
        await this.upsertRows(manager, Line, topUpLines);
        this.logger.log(
          `Onboarding sync (centre ${centreId}): top-up ${topUpLines.length} non-centre-owned lines referenced by synced users`,
          'OnboardingService',
        );
      }

      await this.upsertRows(manager, UserLineMapping, userLineMappings);
      this.logger.log(
        `Onboarding sync (centre ${centreId}): ${userLineMappings.length} user-line mappings`,
        'OnboardingService',
      );
    });
  }

  /**
   * Copy-on-demand dependency: given a set of possibly-foreign center_id
   * values referenced by rows we're about to insert (Roles, Lines, ...),
   * ensure any Centre other than the one being onboarded is copied first so
   * its FK resolves locally. `centreId`'s own Centre row is already synced.
   */
  private async upsertForeignCentres(
    manager: EntityManager,
    referencedCentreIds: (string | null | undefined)[],
    centreId: string,
    contextLabel: string,
  ): Promise<void> {
    const foreignCentreIds = [
      ...new Set(
        referencedCentreIds.filter(
          (id): id is string => Boolean(id) && id !== centreId,
        ),
      ),
    ];
    if (!foreignCentreIds.length) return;

    const foreignCentres = (
      await Promise.all(
        foreignCentreIds.map((id) => this.centralReader.findCentreById(id)),
      )
    ).filter((c): c is Centre => Boolean(c));
    await this.upsertRows(manager, Centre, foreignCentres);
    this.logger.log(
      `Onboarding sync (centre ${centreId}): top-up ${foreignCentres.length} foreign centre(s) owning non-centre-owned ${contextLabel}`,
      'OnboardingService',
    );
  }

  /** Insert-by-existing-PK, skip if already present — never overwrites a local row. */
  private async upsertRows<T extends ObjectLiteral>(
    manager: EntityManager,
    entity: EntityTarget<T>,
    rows: T[],
  ): Promise<void> {
    if (!rows.length) return;
    await manager
      .createQueryBuilder()
      .insert()
      .into(entity)
      .values(rows)
      .orIgnore()
      .execute();
  }
}
