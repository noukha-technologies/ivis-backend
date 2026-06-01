import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { ErrorException } from '../../../common/errors/custom-error.exception';
import {
  AuthUserDto,
  LoginRequestDto,
  LoginResponseDto,
  TokenPair,
  UserContext,
} from '../../../common/dto/auth.dto';
import {
  resolveFlatPermissionsFromMatrix,
} from '../../../common/auth/role-permissions';
import { RoleAccessDao } from '../../database/dao/role-access.dao';
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
    private readonly roleAccessDao: RoleAccessDao,
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

  async login(request: LoginRequestDto, metadata: RequestMetadata): Promise<LoginResponseDto> {
    const user = await this.usersDao.findByEmailWithPassword(request.email);
    if (!user?.password) {
      throw new ErrorException('INVALID_USER');
    }

    const passwordMatches = await bcrypt.compare(request.password, user.password);
    if (!passwordMatches) {
      throw new ErrorException('INVALID_USER');
    }

    const tokens = await this.issueTokens(user, metadata);
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.accessExpiresAt,
      user: this.toAuthUser(user),
    };
  }

  async refresh(refreshToken: string, metadata: RequestMetadata,): Promise<LoginResponseDto> {
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
      throw new ErrorException('INVALID_USER');
    }

    const tokens = await this.issueTokens(user, metadata, session.id);
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.accessExpiresAt,
      user: this.toAuthUser(user),
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
    if (user.roleAccess?.access) {
      return resolveFlatPermissionsFromMatrix(user.roleAccess.access);
    }

    if (user.role_access_id) {
      const roleAccess = await this.roleAccessDao.findActiveById(user.role_access_id);
      if (roleAccess?.access) {
        return resolveFlatPermissionsFromMatrix(roleAccess.access);
      }
    }

    return [];
  }

  private async issueTokens(user: User, metadata: RequestMetadata, sessionId?: string): Promise<TokenPair> {
    const accessJti = randomUUID();
    const refreshJti = randomUUID();
    const refreshExpiresAt = new Date(
      Date.now() + this.refreshExpiryDays * 24 * 60 * 60 * 1000,
    );

    const accessToken = signAccessToken(
      { sub: user.id, jti: accessJti, role: user.roleAccess?.role_name ?? '' },
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
      metadata,
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
      user_name: user.user_name,
      email: user.email,
      role: user.roleAccess?.role_name ?? '',
      role_access_id: user.role_access_id,
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
