import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorException } from '../../../common/errors/custom-error.exception';
import {
  AuthUserDto,
  BootstrapAdminDto,
  BootstrapAdminResponseDto,
  LoginRequestDto,
  LoginResponseDto,
  TokenPair,
  UserContext,
} from '../../../common/dto/auth.dto';
import { AppLogger } from '../../../common/logger/app.logger';
import { generateSnowflakeId } from '../../../common/shared/snowflakeIdGeneration';
import { decrypt, encrypt, hashRefreshTokenKey } from '../../../common/utils/crypto.util';
import { ALL_PERMISSION_KEYS, PermissionKeys } from '../../../common/constants/permissions';
import { DEFAULT_ACCESS_SCOPE, isGlobalScope } from '../../../common/constants/access-scope';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../../common/utils/jwt.util';
import { matrixFromFlatPermissions, resolveFlatPermissionsFromMatrix } from '../../../common/auth/role-permissions';

import { RoleDao } from '../../database/dao/role.dao';
import { UsersDao } from '../../database/dao/users.dao';
import { PermissionDao } from '../../database/dao/permission.dao';
import { UserSessionsDao } from '../../database/dao/user-sessions.dao';
import { OnboardingStatusDao } from '../../database/dao/onboarding-status.dao';

import { IAuthService } from './auth-service.interface';
import { User } from '../../database/entity/user.entity';
import { OnboardingService } from '../../onboarding/service/onboarding.service';
import { CentralOnboardingHttpClientService } from '../../onboarding/service/central-onboarding-http-client.service';

@Injectable()
export class AuthService implements IAuthService {
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  private readonly accessExpiresIn: string;
  private readonly refreshExpiresIn: string;
  private readonly refreshTokenEncryptKey: Buffer;
  private readonly refreshExpiryDays: number;

  constructor(
    private readonly usersDao: UsersDao,
    private readonly userSessionsDao: UserSessionsDao,

    private readonly roleDao: RoleDao,
    private readonly permissionDao: PermissionDao,

    private readonly onboardingService: OnboardingService,
    private readonly onboardingStatusDao: OnboardingStatusDao,

    private readonly centralOnboardingClient: CentralOnboardingHttpClientService,

    private readonly logger: AppLogger,
    private readonly configService: ConfigService,
  ) {
    this.accessSecret =
      this.configService.getOrThrow<string>('JWT_ACCESS_SECRET');
    this.refreshSecret =
      this.configService.getOrThrow<string>('JWT_REFRESH_SECRET');
    this.accessExpiresIn =
      this.configService.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m';
    this.refreshExpiresIn =
      this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d';
    this.refreshExpiryDays = Number(
      this.configService.get<string>('JWT_REFRESH_EXPIRY_DAYS') ?? '7',
    );
    const encryptKey = this.configService.getOrThrow<string>(
      'REFRESH_TOKEN_ENCRYPT_KEY',
    );
    this.refreshTokenEncryptKey = hashRefreshTokenKey(encryptKey);
  }

  /**
   * Unified login decision tree (see ONBOARDING_DB_SYNC_ARCHITECTURE.md §4):
   * local lookup by email always comes first, regardless of onboarding_status
   * — central is only ever consulted on a genuine local miss, or to
   * re-validate a re-scoped Super Admin row. This keeps "once synced, central
   * is never touched again" true for the common case (existing local users,
   * including wrong-password attempts), while still letting a Super Admin
   * log in on any centre server at any time.
   */
  async login(request: LoginRequestDto): Promise<LoginResponseDto> {
    const localUser = await this.usersDao.findByEmailWithPassword(
      request.email,
    );

    if (localUser?.password) {
      this.logger.log(
        `login: ${request.email} found locally` +
        (localUser.requires_central_revalidation
          ? ' (requires central revalidation)'
          : ' (local-only)'),
        'AuthService',
      );
      return localUser.requires_central_revalidation
        ? this.loginReScopedSuperAdmin(localUser, request.password)
        : this.loginLocalOnly(localUser, request.password);
    }

    this.logger.log(
      `login: ${request.email} not found locally — falling back to central onboarding flow`,
      'AuthService',
    );
    return this.loginNotFoundLocally(request);
  }

  private async loginLocalOnly(
    user: User,
    password: string,
  ): Promise<LoginResponseDto> {
    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      throw new ErrorException('INVALID_USER');
    }

    return this.buildSuccessResponse(user);
  }

  /**
   * A re-scoped Super Admin row: re-verify against central when reachable
   * (source of truth — catches revocation/password changes), falling back
   * to the local hash when it's not (offline resilience). Password
   * verification is now fully central-side (see verify-central endpoint) —
   * the centre never receives a hash, only a valid/invalid boolean. Never
   * throws CENTRAL_DB_UNAVAILABLE — a re-scoped row can already log in
   * locally, so an unreachable central degrades to that, never blocks.
   */
  private async loginReScopedSuperAdmin(
    localUser: User,
    password: string,
  ): Promise<LoginResponseDto> {
    let verifyResult: { valid: boolean } | null = null;
    try {
      verifyResult = await this.centralOnboardingClient.verifyCentral(
        localUser.email,
        password,
      );
    } catch (error) {
      this.logger.warn(
        `Central unreachable while re-validating Super Admin ${localUser.email} — falling back to local credentials: ${error instanceof Error ? error.message : String(error)
        }`,
        'AuthService',
      );
    }

    if (verifyResult) {
      if (!verifyResult.valid) {
        throw new ErrorException('INVALID_USER');
      }
      return this.buildSuccessResponse(localUser);
    }

    // Central unreachable — offline fallback.
    return this.loginLocalOnly(localUser, password);
  }

  private async loginNotFoundLocally(
    request: LoginRequestDto,
  ): Promise<LoginResponseDto> {
    let verifyResult;
    try {
      verifyResult = await this.centralOnboardingClient.verifyCentral(
        request.email,
        request.password,
      );
    } catch (error) {
      this.logger.error(
        `Central unreachable during login for ${request.email}: ${error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
        'AuthService',
      );
      throw new ErrorException('CENTRAL_DB_UNAVAILABLE');
    }

    this.logger.log(
      `verify-central result for ${request.email}: valid=${verifyResult.valid}` +
      (verifyResult.valid
        ? `, isGlobalScope=${verifyResult.isGlobalScope}`
        : ''),
      'AuthService',
    );

    if (!verifyResult.valid) {
      throw new ErrorException('INVALID_USER');
    }

    if (verifyResult.isGlobalScope) {
      return this.loginSuperAdmin(request.email);
    }

    const result = await this.onboardingService.ensureOnboarded(
      request.email,
      request.password,
      request.confirmOnboarding ?? false,
      request.selectedSuperAdminIds,
    );

    switch (result.status) {
      case 'CONFIRMATION_REQUIRED':
        return { status: 'CONFIRMATION_REQUIRED', centre: result.centre };
      case 'IN_PROGRESS':
        return { status: 'ONBOARDING_IN_PROGRESS' };
      case 'CENTRE_MISMATCH':
        throw new ErrorException('CENTRE_MISMATCH');
      case 'FAILED':
        throw new ErrorException(
          'SOMETHING_WENT_WRONG',
          `Onboarding sync failed: ${result.error}`,
        );
      case 'COMPLETED': {
        // Local DB is now populated — re-run today's normal local flow.
        const user = await this.usersDao.findByEmailWithPassword(request.email);
        if (!user?.password) {
          throw new ErrorException('INVALID_USER');
        }
        return this.buildSuccessResponse(user);
      }
    }
  }

  /**
   * Super Admin's first login on this box — never touches onboarding_status'
   * tryClaim state machine (that's centre-scoped only). On NODE_ROLE=central
   * this is a real global-scope login (Scenario A — not fully wireable yet,
   * needs a writable central DataSource as this instance's default
   * connection). On a centre node, the centre must already be onboarded
   * (Assumption 3 — no box-identity config exists to bootstrap one from a
   * centre-less user); once it is, the Super Admin is silently re-scoped to
   * that centre's own centre-admin role and logged in.
   */
  private async loginSuperAdmin(email: string): Promise<LoginResponseDto> {
    if (process.env.NODE_ROLE === 'central') {
      const centralUser = await this.usersDao.findByEmailWithPassword(email);
      if (!centralUser?.password) {
        throw new ErrorException('INVALID_USER');
      }
      return this.buildSuccessResponse(centralUser);
    }

    const status = await this.onboardingStatusDao.ensureSingletonRow();
    if (status.status !== 'COMPLETED' || !status.centre_id) {
      throw new ErrorException('CENTRE_NOT_ONBOARDED');
    }

    try {
      await this.onboardingService.syncReScopedSuperAdmin(
        email,
        status.centre_id,
      );
    } catch (error) {
      this.logger.error(
        `Failed to re-scope Super Admin ${email} into centre ${status.centre_id}: ${error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
        'AuthService',
      );
      throw new ErrorException(
        'SOMETHING_WENT_WRONG',
        'Failed to set up Super Admin access on this centre.',
      );
    }

    const localUser = await this.usersDao.findByEmailWithPassword(email);
    if (!localUser?.password) {
      throw new ErrorException('SOMETHING_WENT_WRONG');
    }
    return this.buildSuccessResponse(localUser);
  }

  private async buildSuccessResponse(
    user: User,
    impersonatedBy?: string,
  ): Promise<LoginResponseDto> {
    const tokens = await this.issueTokens(user, undefined, impersonatedBy);
    const permissions = await this.resolveUserPermissions(user);
    return {
      status: 'SUCCESS',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.accessExpiresAt,
      user: this.toAuthUser(user),
      permissions,
    };
  }

  /**
   * Super Admin: log in as a Centre Admin (see DATABASE_SYNC_PLAN.md Part 7,
   * "Login as Centre Admin"). Issues a real session for the target user
   * directly — no password check, since credential replay is impossible with
   * bcrypt-hashed passwords anyway. Restricted to centre-scoped, is_center_admin
   * targets only: never another Super Admin, never a plain operational user.
   */
  async impersonate(
    actor: UserContext,
    targetUserId: string,
  ): Promise<LoginResponseDto> {
    if (!isGlobalScope(actor.user.access_scope)) {
      throw new ErrorException(
        'FORBIDDEN_REQUEST',
        'Only a Super Admin can log in as another user.',
      );
    }
    if (targetUserId === actor.user.id) {
      throw new ErrorException(
        'FORBIDDEN_REQUEST',
        'You are already logged in as yourself.',
      );
    }

    const target = await this.usersDao.findActiveById(targetUserId);
    if (
      !target ||
      target.role?.access_scope !== 'centre' ||
      !target.role?.is_center_admin
    ) {
      throw new ErrorException(
        'FORBIDDEN_REQUEST',
        'You can only log in as a Centre Admin.',
      );
    }

    this.logger.log(
      `Impersonation: ${actor.user.email} logged in as ${target.email} (centre ${target.center_id ?? 'unknown'})`,
      'AuthService',
    );
    return this.buildSuccessResponse(target, actor.user.id);
  }

  /**
   * One-time bootstrap: creates the first admin user and an `admin` role granted
   * every permission. Allowed only while the system has no users, so it cannot be
   * abused once anyone exists.
   */
  async bootstrapAdmin(
    dto: BootstrapAdminDto,
  ): Promise<BootstrapAdminResponseDto> {
    const userCount = await this.usersDao.count({
      where: { is_deleted: false },
    });
    if (userCount > 0) {
      throw new ErrorException(
        'FORBIDDEN_REQUEST',
        'Bootstrap is disabled: the system already has users',
      );
    }

    const roleName = (dto.role_name || 'admin').trim();
    const access = matrixFromFlatPermissions(ALL_PERMISSION_KEYS);

    // Ensure an admin role backed by a full-access permission profile.
    let role = await this.roleDao.findByRoleName(roleName);
    if (!role) {
      const profileName = `${roleName} Access`;
      let permission = await this.permissionDao.findByName(profileName);
      if (permission) {
        permission.access = access;
        permission.is_active = true;
        permission.is_deleted = false;
      } else {
        permission = this.permissionDao.create({
          id: generateSnowflakeId(),
          name: profileName,
          access,
          is_active: true,
        });
      }
      permission = await this.permissionDao.save(permission);

      role = this.roleDao.create({
        id: generateSnowflakeId(),
        role_name: roleName,
        permission_id: permission.id,
        description: 'Bootstrap admin role',
        access_scope: 'global',
      });
      role = await this.roleDao.save(role);
    }

    const nextUserId = await this.usersDao.getNextUserId();
    const user = this.usersDao.create({
      id: generateSnowflakeId(),
      user_id: nextUserId,
      user_code: (dto.user_code || 'ADMIN').trim().toUpperCase(),
      user_name: dto.user_name || 'System Admin',
      email: dto.email.trim().toLowerCase(),
      password: dto.password, // hashed by the User entity @BeforeInsert hook
      role_id: role.id,
    });
    const saved = await this.usersDao.save(user);

    return {
      id: saved.id,
      user_id: saved.user_id,
      user_code: saved.user_code,
      user_name: saved.user_name,
      email: saved.email,
      role_name: role.role_name,
      role_id: role.id,
      role_access_id: role.id, // deprecated alias for backward compatibility
      permissions: resolveFlatPermissionsFromMatrix(access),
    };
  }

  async refresh(refreshToken: string): Promise<LoginResponseDto> {
    const payload = verifyRefreshToken(refreshToken, this.refreshSecret);
    const session = await this.userSessionsDao.getActiveSessionByRefreshJti(
      payload.sub,
      payload.jti,
    );

    if (!session || session.expired_at < new Date()) {
      throw new ErrorException('INVALID_AUTHORISATION_TOKEN');
    }

    const storedRefresh = decrypt(
      session.refresh_token,
      this.refreshTokenEncryptKey,
    );
    if (storedRefresh !== refreshToken) {
      throw new ErrorException('INVALID_AUTHORISATION_TOKEN');
    }

    const user = await this.usersDao.findActiveById(payload.sub);
    if (!user) {
      throw new ErrorException(
        'INVALID_AUTHORISATION_TOKEN',
        'Session user is inactive or not found',
      );
    }

    const tokens = await this.issueTokens(user, session.id);
    const permissions = await this.resolveUserPermissions(user);
    return {
      status: 'SUCCESS',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.accessExpiresAt,
      user: this.toAuthUser(user),
      permissions,
    };
  }

  async logout(userContext: UserContext): Promise<void> {
    await this.userSessionsDao.deleteUserSession(
      userContext.user.id,
      userContext.session.access_token_jti,
    );
  }

  async buildUserContext(
    userId: string,
    accessJti: string,
  ): Promise<UserContext | null> {
    const session = await this.userSessionsDao.getUserSessionByUserIdAndJti(
      userId,
      accessJti,
    );
    if (!session || session.expired_at < new Date()) {
      return null;
    }

    const user = await this.usersDao.findActiveById(userId);
    if (!user) {
      return null;
    }

    return {
      user: this.toAuthUser(user),
      session,
      resolvedPermissions: await this.resolveUserPermissions(user),
    };
  }

  private async resolveUserPermissions(user: User): Promise<string[]> {
    // A global-scope role (Super Admin) always has every permission — this keeps
    // full access correct even for permission keys not surfaced in the matrix.
    let permissions: string[];
    if (isGlobalScope(user.role?.access_scope)) {
      permissions = [...ALL_PERMISSION_KEYS];
    } else {
      const access = user.role?.permission?.access;
      if (access && user.role?.permission?.is_active !== false) {
        permissions = resolveFlatPermissionsFromMatrix(access);
      } else if (user.role_id) {
        const role = await this.roleDao.findActiveByIdWithPermission(
          user.role_id,
        );
        if (role?.permission?.access && role.permission.is_active) {
          permissions = resolveFlatPermissionsFromMatrix(
            role.permission.access,
          );
        } else {
          permissions = [];
        }
      } else {
        permissions = [];
      }
    }

    // Audit logs are visible to every authenticated user.
    if (!permissions.includes(PermissionKeys.AUDIT_VIEW)) {
      permissions = [...permissions, PermissionKeys.AUDIT_VIEW];
    }
    return permissions;
  }

  private async issueTokens(
    user: User,
    sessionId?: string,
    impersonatedBy?: string,
  ): Promise<TokenPair> {
    const accessJti = randomUUID();
    const refreshJti = randomUUID();
    const refreshExpiresAt = new Date(
      Date.now() + this.refreshExpiryDays * 24 * 60 * 60 * 1000,
    );

    const accessToken = signAccessToken(
      { sub: user.id, jti: accessJti, role: user.role?.role_name ?? '' },
      this.accessSecret,
      this.accessExpiresIn,
    );
    const refreshToken = signRefreshToken(
      { sub: user.id, jti: refreshJti },
      this.refreshSecret,
      this.refreshExpiresIn,
    );

    const accessExpiresAt = this.parseExpiryDate(this.accessExpiresIn);

    await this.userSessionsDao.saveUserSession({
      id: sessionId,
      userId: user.id,
      accessTokenJti: accessJti,
      refreshTokenJti: refreshJti,
      refreshToken: encrypt(refreshToken, this.refreshTokenEncryptKey),
      isActive: true,
      expiredAt: refreshExpiresAt,
      lastRefreshedAt: new Date(),
      impersonatedBy,
    });

    return {
      accessToken,
      refreshToken,
      accessJti,
      refreshJti,
      accessExpiresAt,
      refreshExpiresAt,
    };
  }

  private toAuthUser(user: User): AuthUserDto {
    const activeMappings = (user.lineMappings ?? []).filter(
      (m) => !m.is_deleted,
    );
    const lines = activeMappings
      .filter((m) => m.line)
      .map((m) => ({
        id: m.line.id,
        line_id: m.line.line_id,
        name: m.line.name,
        code: m.line.code,
      }));

    return {
      id: user.id,
      user_id: user.user_id,
      user_code: user.user_code,
      user_name: user.user_name,
      email: user.email,
      role: user.role?.role_name ?? '',
      role_id: user.role_id,
      role_access_id: user.role_id,
      access_scope: user.role?.access_scope ?? DEFAULT_ACCESS_SCOPE,
      is_center_admin: user.role?.is_center_admin ?? false,
      center: user.assignedCentre?.centre_name,
      line: lines[0]?.name,
      center_id: user.center_id ?? undefined,
      line_ids: activeMappings.map((m) => m.line_id),
      lines,
    };
  }

  private parseExpiryDate(expiresIn: string): Date {
    const match = /^(\d+)([smhd])$/.exec(expiresIn.trim());
    if (!match) {
      return new Date(Date.now() + 15 * 60 * 1000);
    }
    const value = Number(match[1]);
    const unit = match[2];
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };
    return new Date(Date.now() + value * (multipliers[unit] ?? 60 * 1000));
  }
}
