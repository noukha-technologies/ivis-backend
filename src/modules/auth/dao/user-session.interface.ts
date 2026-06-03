import { RequestMetadata } from '../../../common/utils/request-metadata.util';
import { UserSession } from '../../database/entity/user-session.entity';

export interface UpsertUserSessionData {
  id?: string;
  userId: string;
  accessTokenJti: string;
  refreshTokenJti: string;
  refreshToken: string;
  metadata: RequestMetadata;
  isActive: boolean;
  expiredAt: Date;
  lastRefreshedAt?: Date;
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
