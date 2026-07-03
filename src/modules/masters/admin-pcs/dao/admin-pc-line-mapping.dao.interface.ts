import { AdminPcLineMapping } from '../../../database/entity/admin-pc-line-mapping.entity';

export interface IAdminPcLineMappingDao {
  findActiveByAdminPcId(adminPcId: string): Promise<AdminPcLineMapping[]>;
  findActiveByLineIds(lineIds: string[]): Promise<AdminPcLineMapping[]>;
  replaceForAdminPc(
    adminPcId: string,
    lineIds: string[],
    createdBy?: string,
  ): Promise<void>;
  softDeleteByAdminPcId(adminPcId: string): Promise<void>;
}
