import { Charge } from '../../../database/entity/charge.entity';
import { PaginationQueryDto } from '../../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../../common/interfaces/pagination.interface';

export interface IChargeDao {
  findActiveById(id: string): Promise<Charge | null>;
  findByChargeId(chargeId: number): Promise<Charge | null>;
  findByCombo(centreId: string | undefined, vehicleId: string, category: string): Promise<Charge | null>;
  findPaginated(query: PaginationQueryDto): Promise<PaginatedResult<Charge>>;
  getNextChargeId(): Promise<number>;
}
