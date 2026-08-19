import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';

import { AppLogger } from '../../../common/logger/app.logger';
import { ErrorException } from '../../../common/errors/custom-error.exception';
import { generateSnowflakeId } from '../../../common/shared/snowflakeIdGeneration';
import { UsersDao } from '../../database/dao/users.dao';
import { CentreApiKeyDao } from '../../database/dao/centre-api-key.dao';
import { CentreDao } from '../../database/dao/centre.dao';
import { Role } from '../../database/entity/role.entity';
import { RoleCentreMapping } from '../../database/entity/role-centre-mapping.entity';
import { Permission } from '../../database/entity/permission.entity';
import { Line } from '../../database/entity/line.entity';
import { Centre } from '../../database/entity/centre.entity';
import { User } from '../../database/entity/user.entity';
import { SYNC_ENTITY_MAP, CHUNK_SIZE } from '../../sync/sync-entity-map';

/** Entities the by-ids top-up endpoint supports — only what onboarding's cross-centre FK top-up actually needs. */
const BY_IDS_ENTITIES = {
  Role,
  Permission,
  Line,
  Centre,
} as const;
type ByIdsEntityKey = keyof typeof BY_IDS_ENTITIES;

const EPOCH = new Date(0);
const PULL_TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes
const PULL_SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes — large datasets can take a while, chunked

/**
 * Fixed order for a brand-new centre's FULL initial pull (every entity, from
 * epoch) — same dependency ordering as Database Sync's PULL_ORDER, since the
 * dependency chains (Line before Camera/AdminPc mappings) are structural,
 * not sync-mode-specific. Exported for the centre-side HTTP client (Phase 4)
 * to drive its pull/chunk loop in the correct order.
 */
export const ONBOARDING_PULL_ORDER = [
  'Centre',
  'Permission',
  'Role',
  'RoleCentreMapping',
  'PaymentType',
  'Test',
  'ChargeCategory',
  'Vehicle',
  'Line',
  'Camera',
  'CameraLineMapping',
  'AdminPc',
  'AdminPcLineMapping',
  'Charge',
  'User',
  'UserLineMapping',
];

interface PullTokenEntry {
  centreId: string;
  centreEmail: string;
  expiresAt: number;
}

interface PullSessionEntry {
  centreId: string;
  selectedSuperAdminIds: string[];
  expiresAt: number;
}

/**
 * Central-side business logic for Onboarding Sync's HTTPS bootstrap — see
 * Database_sync_arch_replan.md §5. Runs only on a NODE_ROLE=central
 * deployment; has direct access to its own local DataSource (this IS the
 * central DB, so no separate reader/connection is needed the way the old
 * CentralSyncReaderService needed one from a centre's point of view).
 *
 * pullToken / pullSessionId are short-lived, in-memory only (single central
 * process) — acceptable since onboarding is a one-time, synchronous-feeling
 * handshake, not a durable background job.
 */
@Injectable()
export class OnboardingCentralService {
  private static readonly context = 'OnboardingCentralService';
  private readonly pullTokens = new Map<string, PullTokenEntry>();
  private readonly pullSessions = new Map<string, PullSessionEntry>();

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly usersDao: UsersDao,
    private readonly centreDao: CentreDao,
    private readonly centreApiKeyDao: CentreApiKeyDao,
    private readonly logger: AppLogger,
  ) {}

  /**
   * Lightweight password check for Super Admin auth flows that are NOT the
   * onboarding pull handshake — re-validating an already-onboarded, re-scoped
   * Super Admin on every login, and the on-demand re-scope check for a Super
   * Admin's first login on an already-onboarded centre. Deliberately
   * separate from confirm()/pullStart() — no pullToken, no centre lookup,
   * no centreAdminRoleExists semantics; just "is this password correct
   * centrally right now."
   */
  async verifyCentral(email: string, password: string) {
    const user = await this.usersDao.findByEmailWithPassword(email);
    if (!user?.password || !(await bcrypt.compare(password, user.password))) {
      return { valid: false as const };
    }
    return {
      valid: true as const,
      userId: user.id,
      accessScope: user.role?.access_scope ?? 'centre',
      isGlobalScope: user.role?.access_scope === 'global',
    };
  }

  /**
   * Mints a fresh Database Sync credential for the caller's own centre.
   *
   * The recovery path for a centre that finished onboarding without a usable
   * key. Authenticated by password because that is the only channel a keyless
   * centre still has — every other central route it would need is guarded by
   * the key it does not have.
   *
   * A caller can only ever affect its own centre: the centre is read from the
   * authenticated user's `center_id`, never from the request. Global-scope
   * accounts are refused for the same reason they are refused at confirm —
   * they belong to no single centre, so there is nothing to issue against.
   *
   * Prior keys are revoked, so a lost key cannot keep working and the table
   * does not accumulate a valid key per recovery.
   */
  async issueSyncKey(
    email: string,
    password: string,
  ): Promise<{ apiKey: string; centreId: string; revokedCount: number }> {
    const user = await this.usersDao.findByEmailWithPassword(email);
    if (!user?.password || !(await bcrypt.compare(password, user.password))) {
      throw new ErrorException('INVALID_USER', 'Invalid email or password');
    }
    if (!user.center_id) {
      throw new ErrorException(
        'FORBIDDEN_REQUEST',
        'Global-scope accounts are not tied to a centre, so no sync key can be issued for them',
      );
    }

    const centre = await this.centreDao.findActiveById(user.center_id);
    if (!centre) {
      throw new ErrorException(
        'RESOURCE_NOT_FOUND',
        `Centre ${user.center_id} not found or inactive`,
      );
    }

    const existing = await this.centreApiKeyDao.findAllActive();
    const mine = existing.filter((k) => k.centre_id === centre.id);
    for (const key of mine) {
      await this.centreApiKeyDao.revoke(key.id);
    }

    const plaintextKey = generateSnowflakeId() + generateSnowflakeId();
    const keyHash = await bcrypt.hash(plaintextKey, 10);
    await this.centreApiKeyDao.createForCentre(centre.id, keyHash);

    this.logger.log(
      `Re-issued Database Sync API key for centre ${centre.code} (${centre.id}); revoked ${mine.length} prior key(s)`,
      OnboardingCentralService.context,
    );

    return {
      apiKey: plaintextKey,
      centreId: centre.id,
      revokedCount: mine.length,
    };
  }

  async confirm(email: string, password: string) {
    const user = await this.usersDao.findByEmailWithPassword(email);
    if (!user?.password || !(await bcrypt.compare(password, user.password))) {
      throw new ErrorException('INVALID_USER', 'Invalid email or password');
    }
    if (!user.center_id) {
      throw new ErrorException(
        'FORBIDDEN_REQUEST',
        'Global-scope accounts do not use the onboarding pull handshake',
      );
    }
    const centre = await this.centreDao.findActiveById(user.center_id);
    if (!centre) {
      throw new ErrorException(
        'FORBIDDEN_REQUEST',
        'Centre not found for this account',
      );
    }

    const centreAdminRole = await this.dataSource
      .getRepository(Role)
      .createQueryBuilder('role')
      .innerJoin(
        RoleCentreMapping,
        'rcm',
        'rcm.role_id = role.id AND rcm.centre_id = :centreId AND rcm.is_deleted = false',
        { centreId: user.center_id },
      )
      .where('role.is_center_admin = true')
      .getExists();

    const availableSuperAdmins = await this.usersDao
      .createQueryBuilder('user')
      .innerJoin('user.role', 'role')
      .where('role.access_scope = :scope', { scope: 'global' })
      .andWhere('user.is_deleted = :isDeleted', { isDeleted: false })
      .getMany();

    const pullToken = generateSnowflakeId();
    this.pullTokens.set(pullToken, {
      centreId: user.center_id,
      centreEmail: email,
      expiresAt: Date.now() + PULL_TOKEN_TTL_MS,
    });

    return {
      status: 'CONFIRMATION_REQUIRED' as const,
      centreId: user.center_id,
      centreName: centre.centre_name,
      centreCode: centre.code,
      centreAdminRoleExists: centreAdminRole,
      availableSuperAdmins: availableSuperAdmins.map((u) => ({
        id: u.id,
        email: u.email,
        user_name: u.user_name,
      })),
      pullToken,
    };
  }

  pullStart(
    pullToken: string,
    selectedSuperAdminIds: string[] = [],
  ): { pullSessionId: string } {
    const entry = this.pullTokens.get(pullToken);
    if (!entry || entry.expiresAt < Date.now()) {
      this.pullTokens.delete(pullToken);
      throw new ErrorException(
        'INVALID_AUTHORISATION_TOKEN',
        'Pull token expired or invalid',
      );
    }
    this.pullTokens.delete(pullToken); // one-time use

    const pullSessionId = generateSnowflakeId();
    this.pullSessions.set(pullSessionId, {
      centreId: entry.centreId,
      selectedSuperAdminIds,
      expiresAt: Date.now() + PULL_SESSION_TTL_MS,
    });
    return { pullSessionId };
  }

  async pullChunk(
    pullSessionId: string,
    entityKey: string,
    cursorIso?: string,
  ) {
    const session = this.getSession(pullSessionId);
    const definition = SYNC_ENTITY_MAP[entityKey];
    if (!definition?.pull) {
      throw new ErrorException(
        'FORBIDDEN_REQUEST',
        `${entityKey} is not a valid onboarding pull entity`,
      );
    }
    const cursor = cursorIso ? new Date(cursorIso) : EPOCH;
    const rows = await definition.pull(
      this.dataSource,
      session.centreId,
      cursor,
    );
    const hasMore = rows.length === CHUNK_SIZE;
    const nextCursor = rows.length
      ? ((
          rows[rows.length - 1] as { updated_at?: Date }
        ).updated_at?.toISOString() ?? null)
      : (cursorIso ?? null);
    return { rows, hasMore, nextCursor };
  }

  /**
   * Cross-centre FK top-up (see Database_sync_arch_replan.md §5's
   * "on-demand top-up" note): a synced User's role_id or UserLineMapping's
   * line_id can reference a row NOT owned by the centre being onboarded
   * (e.g. a shared "Center Admin" Role, or a Line owned by another centre).
   * Fetches specific rows by id, no centre-scoping — mirrors the old
   * CentralSyncReaderService's findRolesByIds/findLinesByIds escape hatch.
   * Caller (the centre-side onboarding client) is responsible for chaining
   * a further Line -> Centre top-up call itself if a foreign Line comes
   * back, same as the old upsertForeignCentres step — kept as two separate
   * typed calls rather than a mixed-type response, consistent with every
   * other endpoint in this protocol always returning one entity type.
   */
  async pullByIds(
    pullSessionId: string,
    entityKey: string,
    ids: string[],
  ): Promise<Record<string, unknown>[]> {
    this.getSession(pullSessionId); // validates + keeps the session semantics consistent with pullChunk
    if (!ids.length) return [];
    if (!(entityKey in BY_IDS_ENTITIES)) {
      throw new ErrorException(
        'FORBIDDEN_REQUEST',
        `${entityKey} is not a valid by-ids entity`,
      );
    }
    const entity = BY_IDS_ENTITIES[entityKey as ByIdsEntityKey];
    return (await this.dataSource
      .getRepository(entity)
      .createQueryBuilder('e')
      .where('e.id IN (:...ids)', { ids })
      .getMany()) as unknown as Record<string, unknown>[];
  }

  /**
   * Resolves each selected Super Admin into a "re-scoped user row" the
   * CENTRE will write locally (same PK as the real central Super Admin, but
   * pointed at this centre's own centre-admin role and center_id, with
   * requires_central_revalidation: true — see the earlier Onboarding Sync
   * plan's Part 3). Central itself never writes this row — it doesn't own a
   * local copy of "this Super Admin, scoped to that one centre" for every
   * centre; only the centre does. Best-effort per user: a centre with no
   * centre-admin role yet must never block the whole pull from completing.
   */
  async pullComplete(pullSessionId: string): Promise<{
    apiKey: string;
    reScopedSuperAdmins: Record<string, unknown>[];
  }> {
    const session = this.getSession(pullSessionId);
    this.pullSessions.delete(pullSessionId);

    const reScopedSuperAdmins: Record<string, unknown>[] = [];
    for (const superAdminId of session.selectedSuperAdminIds) {
      try {
        const row = await this.buildReScopedSuperAdminRow(
          superAdminId,
          session.centreId,
        );
        reScopedSuperAdmins.push(row);
      } catch (error) {
        this.logger.warn(
          `Onboarding: failed to re-scope Super Admin ${superAdminId} into centre ${session.centreId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
          OnboardingCentralService.context,
        );
      }
    }

    const plaintextKey = generateSnowflakeId() + generateSnowflakeId();
    const keyHash = await bcrypt.hash(plaintextKey, 10);
    await this.centreApiKeyDao.createForCentre(session.centreId, keyHash);

    this.logger.log(
      `Onboarding: centre ${session.centreId} completed HTTPS pull, API key issued, ` +
        `${reScopedSuperAdmins.length} Super Admin(s) re-scoped`,
      OnboardingCentralService.context,
    );

    return { apiKey: plaintextKey, reScopedSuperAdmins };
  }

  /**
   * On-demand re-scope: a Super Admin logging into a centre ALREADY
   * onboarded by someone else (their account didn't exist, or wasn't
   * selected, during that centre's original pull). No pullSessionId
   * required — this is a standalone call, independent of any pull session.
   */
  async resolveReScopedRow(
    email: string,
    centreId: string,
  ): Promise<Record<string, unknown>> {
    const user = await this.usersDao.findByEmail(email);
    if (!user) {
      throw new ErrorException('INVALID_USER', 'User not found');
    }
    return this.buildReScopedSuperAdminRow(user.id, centreId);
  }

  private async buildReScopedSuperAdminRow(
    superAdminId: string,
    centreId: string,
  ): Promise<Record<string, unknown>> {
    const centreAdminRole = await this.dataSource
      .getRepository(Role)
      .createQueryBuilder('role')
      .innerJoin(
        RoleCentreMapping,
        'rcm',
        'rcm.role_id = role.id AND rcm.centre_id = :centreId AND rcm.is_deleted = false',
        { centreId },
      )
      .where('role.is_center_admin = true')
      .orderBy('role.role_id', 'ASC')
      .getOne();
    if (!centreAdminRole) {
      throw new Error(`No centre-admin role found for centre ${centreId}`);
    }
    // findActiveById excludes password (select: false, see users.dao.ts) —
    // must be fetched explicitly here, or the re-scoped row lands locally
    // with a NULL password and the offline fallback in
    // AuthService.loginReScopedSuperAdmin can never work.
    const superAdmin = await this.dataSource
      .getRepository(User)
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.id = :id', { id: superAdminId })
      .andWhere('user.is_deleted = false')
      .getOne();
    if (!superAdmin) {
      throw new Error(`Super Admin ${superAdminId} not found`);
    }
    return {
      ...superAdmin,
      role_id: centreAdminRole.id,
      center_id: centreId,
      requires_central_revalidation: true,
    };
  }

  private getSession(pullSessionId: string): PullSessionEntry {
    const session = this.pullSessions.get(pullSessionId);
    if (!session || session.expiresAt < Date.now()) {
      this.pullSessions.delete(pullSessionId);
      throw new ErrorException(
        'INVALID_AUTHORISATION_TOKEN',
        'Pull session expired or invalid',
      );
    }
    return session;
  }
}
