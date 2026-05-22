import { UpsertUserSessionData } from "src/common/dto/auth.dto";
import { UserSession } from "src/modules/database/entities/user-session.entity";

export interface IUserSessionDao {
  saveUserSession(input: UpsertUserSessionData): Promise<UserSession>;
  getUserSessionByUserIdAndJti(
    userId: string,
    accessTokenJti: string
  ): Promise<UserSession | null>;
  deleteUserSession(userId: string, accessTokenJti: string): Promise<void>;
}
