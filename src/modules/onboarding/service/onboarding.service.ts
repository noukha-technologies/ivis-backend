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
import { RoleCentreMapping } from '../../database/entity/role-centre-mapping.entity';
import { Permission } from '../../database/entity/permission.entity';
import { UserLineMapping } from '../../database/entity/user-line-mapping.entity';
import { generateSnowflakeId } from '../../../common/shared/snowflakeIdGeneration';

const CONFIRMATION_TTL_MS = 10 * 60 * 1000; // 10 minutes — see plan's Known limitations.
// If a sync claims IN_PROGRESS but the process crashes/restarts mid-transaction
// (Postgres rolls the transaction back — no partial data), nothing ever runs
// the catch block that would mark it FAILED, so the row would otherwise be
// stuck IN_PROGRESS forever. Treat it as stale past this window and let the
// next login attempt restart the handshake from scratch.
const STALE_SYNC_MS = 2 * 60 * 1000; // 2 minutes — matches the frontend retry cap.

export type OnboardingCentreInfo = {
  id: string;
  name: string;
  code: string;
  centreAdminRoleExists: boolean;
  availableSuperAdmins: { id: string; email: string; user_name: string }[];
};

export type EnsureOnboardedResult =
  | { status: 'COMPLETED' }
  | { status: 'IN_PROGRESS' }
  | {
      status: 'CONFIRMATION_REQUIRED';
      centre: OnboardingCentreInfo;
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
    selectedSuperAdminIds?: string[],
  ): Promise<EnsureOnboardedResult> {
    if (!centralUser.center_id) {
      // Global-scope (Super Admin) users never reach this method — AuthService
      // routes them to syncReScopedSuperAdmin instead. A null center_id here
      // would mean a caller bug, not a normal case.
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

    if (status.status === 'FAILED') {
      // A FAILED row must never masquerade as CONFIRMATION_REQUIRED forever —
      // the fresh-PENDING claim below only ever matches status 'PENDING', so
      // a FAILED row would lose that race on every subsequent request and
      // loop silently. Reset it to PENDING so this request (a retry) gets a
      // genuine second attempt instead of replaying the same dead end.
      const lastError = status.last_error;
      await this.onboardingStatusDao.tryClaim(
        status.id,
        ['FAILED'],
        'PENDING',
        { centre_id: null, centre_code: null, confirmation_expires_at: null },
      );
      status = (await this.onboardingStatusDao.getStatus())!;
      if (!confirmOnboarding) {
        return { status: 'FAILED', error: lastError ?? 'Onboarding sync failed' };
      }
      // confirmOnboarding=true (a poll/retry already past the confirm step)
      // — fall through to the fresh-PENDING branch below and retry the sync
      // immediately instead of forcing another confirm round-trip.
    }

    if (status.status === 'PENDING_CONFIRMATION') {
      if (!confirmOnboarding) {
        return {
          status: 'CONFIRMATION_REQUIRED',
          centre: await this.buildCentreInfo(status.centre_id!),
        };
      }
      return this.confirmAndSync(status.id, centreId, selectedSuperAdminIds);
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
        centre: await this.buildCentreInfo(centreId, centre),
      };
    }

    if (confirmOnboarding) {
      // Caller already sent confirmOnboarding=true on this very first hit.
      return this.confirmAndSync(status.id, centreId, selectedSuperAdminIds);
    }

    return {
      status: 'CONFIRMATION_REQUIRED',
      centre: await this.buildCentreInfo(centreId, centre),
    };
  }

  /**
   * Centre info + Super Admin selection candidates for the confirm screen.
   * Super Admin is defined purely by access_scope='global' — it is NOT
   * centre-specific, so every global-scope central user is always offered
   * as a candidate here regardless of whether this particular centre
   * already has its own is_center_admin role. centreAdminRoleExists is
   * still surfaced (advisory only) so the frontend can warn the confirming
   * admin that a selection may not take effect yet for this centre — it
   * no longer gates the list itself.
   */
  private async buildCentreInfo(
    centreId: string,
    knownCentre?: Centre | null,
  ): Promise<OnboardingCentreInfo> {
    const centre =
      knownCentre ?? (await this.centralReader.findCentreById(centreId));
    const roles = await this.centralReader.findRolesByCentreId(centreId);
    const centreAdminRoleExists = roles.some((r) => r.is_center_admin);
    const availableSuperAdmins = (
      await this.centralReader.findGlobalScopeUsers()
    ).map((u) => ({
      id: u.id,
      email: u.email,
      user_name: u.user_name,
    }));
    return {
      id: centreId,
      name: centre?.name ?? '',
      code: centre?.code ?? '',
      centreAdminRoleExists,
      availableSuperAdmins,
    };
  }

  private async confirmAndSync(
    statusId: string,
    centreId: string,
    selectedSuperAdminIds?: string[],
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
      await this.syncCentreScopedData(centreId, selectedSuperAdminIds);
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
  private async syncCentreScopedData(
    centreId: string,
    selectedSuperAdminIds?: string[],
  ): Promise<void> {
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
      // Role↔Centre is many-to-many — record this centre's link to each
      // synced role locally (not every OTHER centre that role may also be
      // linked to; this box only needs to know about its own centre).
      await this.upsertRows(
        manager,
        RoleCentreMapping,
        roles.map((r) =>
          manager.create(RoleCentreMapping, {
            id: generateSnowflakeId(),
            role_id: r.id,
            centre_id: centreId,
            is_deleted: false,
          }),
        ),
      );
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
        // the user, so its role_id FK always resolves locally. Role has no
        // direct FK to Centre any more (see RoleCentreMapping), so unlike
        // Lines below, no foreign-centre top-up is needed here — inserting
        // a foreign Role locally has zero centre dependency now.
        const topUpRoles = await this.centralReader.findRolesByIds(
          missingRoleIds,
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

    // Re-scope only the Super Admin(s) explicitly selected by the confirming
    // Centre Admin during setup (see Part 4, ONBOARDING_DB_SYNC_ARCHITECTURE.md
    // — replaces the earlier "re-scope everyone automatically" behavior).
    // Kept OUTSIDE the centre's own sync transaction and best-effort per user:
    // this must never be able to roll back (or block completion of) the
    // centre's own onboarding. A Super Admin missing a centre-admin role
    // centrally is that Super Admin's problem to surface when THEY next log
    // in (see syncReScopedSuperAdmin's on-demand call site in auth.service.ts),
    // not something that should ever stop a Centre Admin's own onboarding.
    const selectedIds = new Set(selectedSuperAdminIds ?? []);
    if (selectedIds.size) {
      const globalUsers = (
        await this.centralReader.findGlobalScopeUsers()
      ).filter((u) => selectedIds.has(u.id));
      let reScopedCount = 0;
      for (const globalUser of globalUsers) {
        try {
          await this.syncReScopedSuperAdmin(globalUser, centreId);
          reScopedCount++;
        } catch (error) {
          this.logger.warn(
            `Onboarding sync (centre ${centreId}): could not re-scope Super Admin ${globalUser.email} — ${
              error instanceof Error ? error.message : String(error)
            }`,
            'OnboardingService',
          );
        }
      }
      this.logger.log(
        `Onboarding sync (centre ${centreId}): re-scoped ${reScopedCount}/${globalUsers.length} selected Super Admin(s) locally`,
        'OnboardingService',
      );
    }
  }

  /**
   * On-demand re-scope: a Super Admin logging in on a centre already onboarded
   * by someone else (their account didn't exist yet, or wasn't included in
   * that centre's original sync). Runs its own transaction, independent of
   * onboarding_status/tryClaim — never touches the centre state machine.
   */
  async syncReScopedSuperAdmin(
    centralUser: User,
    centreId: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await this.reScopeSuperAdminWithinTransaction(
        manager,
        centralUser,
        centreId,
      );
    });
    this.logger.log(
      `Onboarding: re-scoped Super Admin ${centralUser.email} into centre ${centreId} as centre-admin`,
      'OnboardingService',
    );
  }

  private async reScopeSuperAdminWithinTransaction(
    manager: EntityManager,
    centralUser: User,
    centreId: string,
  ): Promise<void> {
    // Role↔Centre is many-to-many (role_centre_mappings) — any is_center_admin
    // role linked to this centre satisfies re-scoping, including a role
    // shared across several centres (that's the whole point of the M:N move:
    // one "Center Admin" role, linked to many centres, instead of a
    // dedicated duplicate role per centre).
    const centreAdminRole = await manager
      .createQueryBuilder(Role, 'role')
      .innerJoin(
        'role.mappings',
        'rcm',
        'rcm.centre_id = :centreId AND rcm.is_deleted = false',
        { centreId },
      )
      .where('role.is_center_admin = true')
      .andWhere('role.is_deleted = false')
      .orderBy('role.role_id', 'ASC') // deterministic if a centre somehow has more than one
      .getOne();
    if (!centreAdminRole) {
      throw new Error(
        `No centre-admin role found for centre ${centreId} — cannot re-scope Super Admin ${centralUser.email}`,
      );
    }

    // Strip any joined relations (e.g. `role`, if centralUser came from a
    // query that selected them) — only plain columns go through the insert,
    // same as every other upsertRows() call site in this file.
    const { role: _role, assignedCentre: _assignedCentre, lineMappings: _lineMappings, ...userColumns } =
      centralUser as User & {
        role?: unknown;
        assignedCentre?: unknown;
        lineMappings?: unknown;
      };

    const reScopedUser = {
      ...userColumns,
      role_id: centreAdminRole.id,
      center_id: centreId,
      requires_central_revalidation: true,
    } as User;
    await this.upsertRows(manager, User, [reScopedUser]);
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
