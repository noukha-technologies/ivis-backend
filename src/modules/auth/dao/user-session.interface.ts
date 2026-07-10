import { UserSession } from '../../database/entity/user-session.entity';

export interface UpsertUserSessionData {
  id?: string;
  userId: string;
  accessTokenJti: string;
  refreshTokenJti: string;
  refreshToken: string;
  isActive: boolean;
  expiredAt: Date;
  lastRefreshedAt?: Date;
  /** Set only when this session was minted via Super Admin impersonation. */
  impersonatedBy?: string;
}

export interface IUserSessionDao {
  saveUserSession(input: UpsertUserSessionData): Promise<UserSession>;
  getUserSessionByUserIdAndJti(
    userId: string,
    accessTokenJti: string,
  ): Promise<UserSession | null>;
  getActiveSessionByRefreshJti(
    userId: string,
    refreshJti: string,
  ): Promise<UserSession | null>;
  deleteUserSession(userId: string, accessTokenJti: string): Promise<void>;
  deleteByPermissionId(permissionId: string): Promise<void>;
}
