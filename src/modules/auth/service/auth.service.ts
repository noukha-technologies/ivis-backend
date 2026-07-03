import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
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
import {
  matrixFromFlatPermissions,
  resolveFlatPermissionsFromMatrix,
} from '../../../common/auth/role-permissions';
import { ALL_PERMISSION_KEYS } from '../../../common/constants/permissions';
import { DEFAULT_ACCESS_SCOPE } from '../../../common/constants/access-scope';
import { generateSnowflakeId } from '../../../common/shared/snowflakeIdGeneration';
import { PermissionDao } from '../../database/dao/permission.dao';
import { RoleDao } from '../../database/dao/role.dao';
import {
  decrypt,
  encrypt,
  hashRefreshTokenKey,
} from '../../../common/utils/crypto.util';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../../common/utils/jwt.util';
import { RequestMetadata } from '../../../common/utils/request-metadata.util';
import { UsersDao } from '../../database/dao/users.dao';
import { User } from '../../database/entity/user.entity';
import { UserSessionsDao } from '../../database/dao/user-sessions.dao';
import { IAuthService } from './auth-service.interface';

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
    private readonly configService: ConfigService,
  ) {
    this.accessSecret = this.configService.getOrThrow<string>('JWT_ACCESS_SECRET');
    this.refreshSecret = this.configService.getOrThrow<string>('JWT_REFRESH_SECRET');
    this.accessExpiresIn = this.configService.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m';
    this.refreshExpiresIn = this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d';
    this.refreshExpiryDays = Number(this.configService.get<string>('JWT_REFRESH_EXPIRY_DAYS') ?? '7');
    const encryptKey = this.configService.getOrThrow<string>('REFRESH_TOKEN_ENCRYPT_KEY');
    this.refreshTokenEncryptKey = hashRefreshTokenKey(encryptKey);
  }

  async login(request: LoginRequestDto): Promise<LoginResponseDto> {
    const user = await this.usersDao.findByEmailWithPassword(request.email);
    if (!user?.password) {
      throw new ErrorException('INVALID_USER');
    }

    const passwordMatches = await bcrypt.compare(request.password, user.password);
    if (!passwordMatches) {
      throw new ErrorException('INVALID_USER');
    }

    const tokens = await this.issueTokens(user);
    const permissions = await this.resolveUserPermissions(user);
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.accessExpiresAt,
      user: this.toAuthUser(user),
      permissions,
    };
  }

  /**
   * One-time bootstrap: creates the first admin user and an `admin` role granted
   * every permission. Allowed only while the system has no users, so it cannot be
   * abused once anyone exists.
   */
  async bootstrapAdmin(dto: BootstrapAdminDto): Promise<BootstrapAdminResponseDto> {
    const userCount = await this.usersDao.count({ where: { is_deleted: false } });
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

    const storedRefresh = decrypt(session.refresh_token, this.refreshTokenEncryptKey);
    if (storedRefresh !== refreshToken) {
      throw new ErrorException('INVALID_AUTHORISATION_TOKEN');
    }

    const user = await this.usersDao.findActiveById(payload.sub);
    if (!user) {
      throw new ErrorException('INVALID_AUTHORISATION_TOKEN', 'Session user is inactive or not found');
    }

    const tokens = await this.issueTokens(user, session.id);
    const permissions = await this.resolveUserPermissions(user);
    return {
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

  async buildUserContext(userId: string, accessJti: string): Promise<UserContext | null> {
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
    const access = user.role?.permission?.access;
    if (access && user.role?.permission?.is_active !== false) {
      return resolveFlatPermissionsFromMatrix(access);
    }

    if (user.role_id) {
      const role = await this.roleDao.findActiveByIdWithPermission(user.role_id);
      if (role?.permission?.access && role.permission.is_active) {
        return resolveFlatPermissionsFromMatrix(role.permission.access);
      }
    }

    return [];
  }

  private async issueTokens(user: User, sessionId?: string): Promise<TokenPair> {
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
    const activeMappings = (user.lineMappings ?? []).filter((m) => !m.is_deleted);
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
      center: user.assignedCentre?.name,
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
