import { Centre } from '../../../database/entity/centre.entity';
import { PaginationQueryDto } from '../../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../../common/interfaces/pagination.interface';

export interface ICentreDao {
  findActiveById(id: string): Promise<Centre | null>;
  findByCode(code: string): Promise<Centre | null>;
  findByName(name: string): Promise<Centre | null>;
  findByCentreId(centreId: number): Promise<Centre | null>;
  findByProviderBranchCode(branchCode: string): Promise<Centre | null>;
  findAllWithProviderBranchCode(): Promise<Centre[]>;
  findPaginated(query: PaginationQueryDto): Promise<PaginatedResult<Centre>>;
  getNextCentreId(): Promise<number>;
}
