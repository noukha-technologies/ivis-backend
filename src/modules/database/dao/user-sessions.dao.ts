import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import {
  IUserSessionDao,
  UpsertUserSessionData,
} from '../../auth/dao/user-session.interface';
import { generateSnowflakeId } from '../../../common/shared/snowflakeIdGeneration';
import { UserSession } from '../entity/user-session.entity';

@Injectable()
export class UserSessionsDao
  extends Repository<UserSession>
  implements IUserSessionDao
{
  constructor(private readonly dataSource: DataSource) {
    super(UserSession, dataSource.createEntityManager());
  }

  async saveUserSession(input: UpsertUserSessionData): Promise<UserSession> {
    if (input.id) {
      await this.update(
        { id: input.id },
        {
          access_token_jti: input.accessTokenJti,
          refresh_token_jti: input.refreshTokenJti,
          refresh_token: input.refreshToken,
          is_active: input.isActive,
          expired_at: input.expiredAt,
          last_refreshed_at: input.lastRefreshedAt,
        },
      );
      const updated = await this.findOne({ where: { id: input.id } });
      return updated!;
    }

    const session = this.create({
      id: generateSnowflakeId(),
      user_id: input.userId,
      created_by: input.userId,
      impersonated_by: input.impersonatedBy,
      access_token_jti: input.accessTokenJti,
      refresh_token_jti: input.refreshTokenJti,
      refresh_token: input.refreshToken,
      is_active: input.isActive,
      expired_at: input.expiredAt,
      last_refreshed_at: input.lastRefreshedAt,
    });
    return this.save(session);
  }

  async getUserSessionByUserIdAndJti(
    userId: string,
    accessTokenJti: string,
  ): Promise<UserSession | null> {
    return this.findOne({
      where: {
        user_id: userId,
        access_token_jti: accessTokenJti,
        is_active: true,
      },
    });
  }

  async getActiveSessionByRefreshJti(
    userId: string,
    refreshJti: string,
  ): Promise<UserSession | null> {
    return this.findOne({
      where: {
        user_id: userId,
        refresh_token_jti: refreshJti,
        is_active: true,
      },
    });
  }

  async deactivateSession(
    userId: string,
    accessTokenJti: string,
  ): Promise<void> {
    await this.update(
      { user_id: userId, access_token_jti: accessTokenJti },
      { is_active: false },
    );
  }

  async deleteUserSession(
    userId: string,
    accessTokenJti: string,
  ): Promise<void> {
    await this.deactivateSession(userId, accessTokenJti);
  }

  async deleteByPermissionId(permissionId: string): Promise<void> {
    await this.manager.query(
      `
        DELETE FROM core.user_sessions
        WHERE user_id IN (
          SELECT u.id FROM core.users u
          INNER JOIN core.roles r ON r.id = u.role_id
          WHERE r.permission_id = $1
        )
      `,
      [permissionId],
    );
  }
}
