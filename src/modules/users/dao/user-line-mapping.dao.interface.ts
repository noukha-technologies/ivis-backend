import { UserLineMapping } from '../../database/entity/user-line-mapping.entity';

export interface IUserLineMappingDao {
  findActiveByUserId(userId: string): Promise<UserLineMapping[]>;
  findActiveByLineIds(lineIds: string[]): Promise<UserLineMapping[]>;
  replaceForUser(userId: string, lineIds: string[], createdBy?: string): Promise<void>;
  /** Diff the user's active lines against the desired set: insert added, soft-delete removed, keep unchanged. */
  syncForUser(userId: string, lineIds: string[], createdBy?: string): Promise<void>;
  softDeleteByUserId(userId: string): Promise<void>;
}
