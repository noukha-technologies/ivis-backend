import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  EntityTarget,
  ObjectLiteral,
} from 'typeorm';

import { AppLogger } from '../../../common/logger/app.logger';
import { OnboardingStatusDao } from '../../database/dao/onboarding-status.dao';
import { CentralOnboardingHttpClientService } from './central-onboarding-http-client.service';
import { User } from '../../database/entity/user.entity';
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
import { UserLineMapping } from '../../database/entity/user-line-mapping.entity';
import { generateSnowflakeId } from '../../../common/shared/snowflakeIdGeneration';
import { ONBOARDING_PULL_ORDER } from './onboarding-central.service';

const CONFIRMATION_TTL_MS = 10 * 60 * 1000; // 10 minutes
// If a sync claims IN_PROGRESS but the process crashes/restarts mid-pull,
// nothing ever runs the catch block that would mark it FAILED, so the row
// would otherwise be stuck IN_PROGRESS forever. Treat it as stale past this
// window and let the next login attempt restart the handshake from scratch.
const STALE_SYNC_MS = 2 * 60 * 1000; // 2 minutes — matches the frontend retry cap.

/** entity_key -> real TypeORM class, for writing chunked pull rows locally. Mirrors modules/sync/sync-entity-map.ts's shape but scoped to onboarding's own pull order. */
const ONBOARDING_ENTITY_CLASSES: Record<string, EntityTarget<ObjectLiteral>> = {
  Centre,
  Role,
  Permission,
  RoleCentreMapping,
  PaymentType,
  Test,
  Vehicle,
  ChargeCategory,
  Line,
  Camera,
  CameraLineMapping,
  AdminPc,
  AdminPcLineMapping,
  Charge,
  User,
  UserLineMapping,
};

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
  | { status: 'CONFIRMATION_REQUIRED'; centre: OnboardingCentreInfo }
  | { status: 'CENTRE_MISMATCH' }
  | { status: 'FAILED'; error: string };

/**
 * Centre-role Onboarding Sync — see Database_sync_arch_replan.md §5.
 * Rewritten from the old DB-connection version: every "read from central"
 * call is now a chunked HTTPS request via CentralOnboardingHttpClientService,
 * never a direct query. The state machine itself (PENDING ->
 * PENDING_CONFIRMATION -> IN_PROGRESS -> COMPLETED/FAILED, tryClaim atomicity,
 * stale-run recovery) is unchanged.
 */
@Injectable()
export class OnboardingService {
  private static readonly context = 'OnboardingService';

  constructor(
    private readonly onboardingStatusDao: OnboardingStatusDao,
    private readonly centralClient: CentralOnboardingHttpClientService,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly logger: AppLogger,
  ) {}

  /**
   * Drives the onboarding state machine for one login attempt. Every state
   * transition goes through OnboardingStatusDao.tryClaim — a DB-level atomic
   * conditional UPDATE — so concurrent logins can never double-sync.
   *
   * Unlike the old version, this no longer takes a pre-fetched central User
   * (the centre never receives one — password verification is fully
   * central-side now, see AuthService.login()). It takes raw credentials and
   * calls /onboarding/confirm itself.
   */
  async ensureOnboarded(
    email: string,
    password: string,
    confirmOnboarding: boolean,
    selectedSuperAdminIds?: string[],
  ): Promise<EnsureOnboardedResult> {
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
        OnboardingService.context,
      );
      await this.onboardingStatusDao.tryClaim(
        status.id,
        ['IN_PROGRESS'],
        'PENDING',
        { centre_id: null, centre_code: null, confirmation_expires_at: null },
      );
      status = (await this.onboardingStatusDao.getStatus())!;
    }

    if (status.status === 'COMPLETED') {
      return { status: 'COMPLETED' };
    }
    if (status.status === 'IN_PROGRESS') {
      return { status: 'IN_PROGRESS' };
    }

    if (status.status === 'FAILED') {
      const lastError = status.last_error;
      await this.onboardingStatusDao.tryClaim(
        status.id,
        ['FAILED'],
        'PENDING',
        { centre_id: null, centre_code: null, confirmation_expires_at: null },
      );
      status = (await this.onboardingStatusDao.getStatus())!;
      if (!confirmOnboarding) {
        return {
          status: 'FAILED',
          error: lastError ?? 'Onboarding sync failed',
        };
      }
    }

    if (status.status === 'PENDING_CONFIRMATION') {
      if (status.centre_id) {
        // Already confirmed once — a login from a DIFFERENT centre's user
        // while this box is mid-confirmation for another centre is a
        // mismatch, same as the old version's post-confirm check.
      }
      if (!confirmOnboarding) {
        return {
          status: 'CONFIRMATION_REQUIRED',
          centre: await this.reconfirmCentreInfo(email, password),
        };
      }
      return this.confirmAndSync(
        status.id,
        email,
        password,
        selectedSuperAdminIds,
      );
    }

    // status.status === 'PENDING' (fresh, or just reverted from an expiry)
    let confirmResult;
    try {
      confirmResult = await this.centralClient.confirm(email, password);
    } catch (error) {
      this.logger.error(
        `Central unreachable during onboarding confirm for ${email}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
        OnboardingService.context,
      );
      throw error;
    }

    const claimed = await this.onboardingStatusDao.tryClaim(
      status.id,
      ['PENDING'],
      'PENDING_CONFIRMATION',
      {
        centre_id: confirmResult.centreId,
        centre_code: confirmResult.centreCode,
        confirmation_expires_at: new Date(Date.now() + CONFIRMATION_TTL_MS),
      },
    );

    if (!claimed) {
      const fresh = await this.onboardingStatusDao.getStatus();
      if (fresh?.status === 'IN_PROGRESS') {
        return { status: 'IN_PROGRESS' };
      }
      return {
        status: 'CONFIRMATION_REQUIRED',
        centre: this.toCentreInfo(confirmResult),
      };
    }

    if (confirmOnboarding) {
      return this.confirmAndSync(
        status.id,
        email,
        password,
        selectedSuperAdminIds,
        confirmResult.pullToken,
      );
    }

    return {
      status: 'CONFIRMATION_REQUIRED',
      centre: this.toCentreInfo(confirmResult),
    };
  }

  private toCentreInfo(confirmResult: {
    centreId: string;
    centreName: string;
    centreCode: string;
    centreAdminRoleExists: boolean;
    availableSuperAdmins: { id: string; email: string; user_name: string }[];
  }): OnboardingCentreInfo {
    return {
      id: confirmResult.centreId,
      name: confirmResult.centreName,
      code: confirmResult.centreCode,
      centreAdminRoleExists: confirmResult.centreAdminRoleExists,
      availableSuperAdmins: confirmResult.availableSuperAdmins,
    };
  }

  /** Re-confirming (idempotent re-hit before confirmOnboarding=true) needs a fresh call — the pullToken from the first /confirm may have expired. */
  private async reconfirmCentreInfo(
    email: string,
    password: string,
  ): Promise<OnboardingCentreInfo> {
    const confirmResult = await this.centralClient.confirm(email, password);
    return this.toCentreInfo(confirmResult);
  }

  private async confirmAndSync(
    statusId: string,
    email: string,
    password: string,
    selectedSuperAdminIds: string[] | undefined,
    knownPullToken?: string,
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
      const pullToken =
        knownPullToken ??
        (await this.centralClient.confirm(email, password)).pullToken;
      await this.syncCentreScopedData(pullToken, selectedSuperAdminIds);
      await this.onboardingStatusDao.tryClaim(
        statusId,
        ['IN_PROGRESS'],
        'COMPLETED',
        {
          data_synced_at: new Date(),
        },
      );
      return { status: 'COMPLETED' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Onboarding sync failed: ${message}`,
        error instanceof Error ? error.stack : undefined,
        OnboardingService.context,
      );
      await this.onboardingStatusDao.markFailed(statusId, message);
      return { status: 'FAILED', error: message };
    }
  }

  /**
   * Chunked pull loop, one transaction per chunk (see
   * Database_sync_arch_replan.md §5's transaction-shape note — an
   * interrupted pull now leaves a resumable partial state, not a clean
   * rollback, which is the accepted tradeoff for chunking a potentially
   * large initial dataset). Cross-centre FK top-up (foreign Roles/Lines
   * referenced by User/UserLineMapping) is resolved via pullByIds after each
   * relevant entity's full pull completes.
   */
  private async syncCentreScopedData(
    pullToken: string,
    selectedSuperAdminIds: string[] | undefined,
  ): Promise<void> {
    const { pullSessionId } = await this.centralClient.pullStart(
      pullToken,
      selectedSuperAdminIds ?? [],
    );

    const syncedRoleIds = new Set<string>();
    const syncedLineIds = new Set<string>();

    for (const entityKey of ONBOARDING_PULL_ORDER) {
      const entityClass = ONBOARDING_ENTITY_CLASSES[entityKey];
      let cursor: string | undefined;
      let hasMore = true;
      let total = 0;

      while (hasMore) {
        const response = await this.centralClient.pullChunk(
          pullSessionId,
          entityKey,
          cursor,
        );
        if (!response.rows.length) break;

        // On-demand cross-centre FK top-up MUST happen before this chunk's
        // own insert, using the chunk's own rows to know what's referenced —
        // reading back what's already local (as an earlier version of this
        // method did) is too late, since the FK violation already happened
        // by the time anything could be read back.
        if (entityKey === 'User') {
          await this.topUpForeignRoles(
            pullSessionId,
            response.rows,
            syncedRoleIds,
          );
        }
        if (entityKey === 'UserLineMapping') {
          await this.topUpForeignLines(
            pullSessionId,
            response.rows,
            syncedLineIds,
          );
        }

        await this.dataSource.transaction(async (manager) => {
          await this.upsertRows(manager, entityClass, response.rows);
        });

        if (entityKey === 'Role') {
          for (const row of response.rows)
            syncedRoleIds.add((row as { id: string }).id);
        }
        if (entityKey === 'Line') {
          for (const row of response.rows)
            syncedLineIds.add((row as { id: string }).id);
        }

        total += response.rows.length;
        cursor = response.nextCursor ?? cursor;
        hasMore = response.hasMore;
      }

      this.logger.log(
        `Onboarding sync: ${total} ${entityKey} row(s)`,
        OnboardingService.context,
      );
    }

    // Re-scoped Super Admin rows — returned by pull/complete, written
    // locally here (central never owns a per-centre copy of these, see
    // onboarding-central.service.ts's pullComplete doc comment).
    const { apiKey, reScopedSuperAdmins } =
      await this.centralClient.pullComplete(pullSessionId);

    // Persist the Database Sync credential central just issued for this centre.
    // It is returned exactly once, at the end of the pull — dropping it here
    // used to mean the only way to sync afterwards was pasting a key into
    // CENTRAL_SYNC_API_KEY by hand. Written onto the centre's own row, which
    // the Centre sync definition protects via localOnlyColumns so the next
    // pull cannot overwrite it with central's null.
    await this.storeSyncApiKey(apiKey);

    if (reScopedSuperAdmins.length) {
      await this.dataSource.transaction(async (manager) => {
        await this.upsertRows(manager, User, reScopedSuperAdmins as unknown as User[]);
      });
      this.logger.log(
        `Onboarding sync: re-scoped ${reScopedSuperAdmins.length} Super Admin(s) locally`,
        OnboardingService.context,
      );
    }
  }

  /**
   * Records the issued Database Sync key on this centre's own `centres` row.
   *
   * Never throws: onboarding has already pulled every row successfully by this
   * point, and failing the whole run over the credential write would leave the
   * centre unusable rather than merely unable to sync. A warning is enough —
   * the sync client reports the missing key clearly on the first attempt.
   */
  private async storeSyncApiKey(apiKey: string | undefined): Promise<void> {
    if (!apiKey?.trim()) {
      this.logger.warn(
        'Onboarding: central returned no Database Sync API key — sync will need CENTRAL_SYNC_API_KEY set manually.',
        OnboardingService.context,
      );
      return;
    }

    try {
      const status = await this.onboardingStatusDao.getStatus();
      const centreId = status?.centre_id;
      if (!centreId) {
        this.logger.warn(
          'Onboarding: no centre_id on the onboarding status row, cannot store the Database Sync API key.',
          OnboardingService.context,
        );
        return;
      }

      await this.dataSource.query(
        `UPDATE "master"."centres" SET "sync_api_key" = $1 WHERE "id" = $2`,
        [apiKey.trim(), centreId],
      );
      this.logger.log(
        `Onboarding: Database Sync API key stored for centre ${centreId}`,
        OnboardingService.context,
      );
    } catch (error) {
      this.logger.warn(
        `Onboarding: failed to store the Database Sync API key — ${
          error instanceof Error ? error.message : String(error)
        }`,
        OnboardingService.context,
      );
    }
  }

  /**
   * A synced User's role_id can reference a Role not owned by this centre
   * (e.g. a shared "Center Admin" role whose primary link is elsewhere).
   * Inspects the User chunk about to be inserted (NOT what's already local —
   * that would be too late, the insert that needs this top-up hasn't
   * happened yet), finds any role_id not in syncedRoleIds, and top-ups those
   * specific Roles (+ their Permission) via pullByIds before the caller
   * inserts the User chunk.
   */
  private async topUpForeignRoles(
    pullSessionId: string,
    userRows: Record<string, unknown>[],
    syncedRoleIds: Set<string>,
  ): Promise<void> {
    const missingRoleIds = [
      ...new Set(
        userRows
          .map((u) => u.role_id as string | undefined)
          .filter((id): id is string => Boolean(id) && !syncedRoleIds.has(id!)),
      ),
    ];
    if (!missingRoleIds.length) return;

    const topUpRoles = await this.centralClient.pullByIds(
      pullSessionId,
      'Role',
      missingRoleIds,
    );
    if (!topUpRoles.length) return;

    const permissionIds = [
      ...new Set(
        topUpRoles
          .map((r) => (r as { permission_id?: string }).permission_id)
          .filter(Boolean) as string[],
      ),
    ];
    const topUpPermissions = permissionIds.length
      ? await this.centralClient.pullByIds(
          pullSessionId,
          'Permission',
          permissionIds,
        )
      : [];

    await this.dataSource.transaction(async (manager) => {
      await this.upsertRows(manager, Permission, topUpPermissions as unknown as Permission[]);
      await this.upsertRows(manager, Role, topUpRoles as unknown as Role[]);
    });
    this.logger.log(
      `Onboarding sync: top-up ${topUpRoles.length} non-centre-owned role(s) referenced by synced users`,
      OnboardingService.context,
    );
  }

  /**
   * Same idea for UserLineMapping -> Line -> (that Line's own) Centre — a
   * mapped user's line can belong to a different centre than the one being
   * onboarded. Inspects the UserLineMapping chunk about to be inserted, not
   * what's already local, for the same reason as topUpForeignRoles above.
   */
  private async topUpForeignLines(
    pullSessionId: string,
    mappingRows: Record<string, unknown>[],
    syncedLineIds: Set<string>,
  ): Promise<void> {
    const missingLineIds = [
      ...new Set(
        mappingRows
          .map((m) => m.line_id as string | undefined)
          .filter((id): id is string => Boolean(id) && !syncedLineIds.has(id!)),
      ),
    ];
    if (!missingLineIds.length) return;

    const topUpLines = await this.centralClient.pullByIds(
      pullSessionId,
      'Line',
      missingLineIds,
    );
    if (!topUpLines.length) return;

    const foreignCentreIds = [
      ...new Set(
        topUpLines
          .map((l) => (l as { centre_id?: string }).centre_id)
          .filter(Boolean) as string[],
      ),
    ];
    const foreignCentres = foreignCentreIds.length
      ? await this.centralClient.pullByIds(
          pullSessionId,
          'Centre',
          foreignCentreIds,
        )
      : [];

    await this.dataSource.transaction(async (manager) => {
      await this.upsertRows(manager, Centre, foreignCentres as unknown as Centre[]);
      await this.upsertRows(manager, Line, topUpLines as unknown as Line[]);
    });
    this.logger.log(
      `Onboarding sync: top-up ${topUpLines.length} non-centre-owned line(s) (+ ${foreignCentres.length} owning centre(s)) referenced by synced users`,
      OnboardingService.context,
    );
  }

  /**
   * On-demand re-scope: a Super Admin logging in on a centre already
   * onboarded by someone else. No pull session, no state machine — a single
   * central call resolves the re-scoped row, written locally in its own
   * transaction.
   */
  async syncReScopedSuperAdmin(email: string, centreId: string): Promise<void> {
    const row = await this.centralClient.resolveReScopedRow(email, centreId);
    await this.dataSource.transaction(async (manager) => {
      await this.upsertRows(manager, User, [row as ObjectLiteral]);
    });
    this.logger.log(
      `Onboarding: re-scoped Super Admin ${email} into centre ${centreId}`,
      OnboardingService.context,
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
