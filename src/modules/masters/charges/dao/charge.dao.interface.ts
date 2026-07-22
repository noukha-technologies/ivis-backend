import { Charge } from '../../../database/entity/charge.entity';
import { ChargeCategory } from '../../../database/entity/charge-category.entity';
import { PaginationQueryDto } from '../../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../../common/interfaces/pagination.interface';

export interface IChargeDao {
  findActiveById(id: string): Promise<Charge | null>;
  findByChargeId(chargeId: number): Promise<Charge | null>;
  findByCombo(
    centreId: string | undefined,
    vehicleType: string,
    chargeCategoryId: string,
  ): Promise<Charge | null>;
  findByVehicleType(
    centreId: string | undefined,
    vehicleType: string,
  ): Promise<Charge | null>;
  findActiveCategoriesByVehicleType(
    vehicleType: string,
  ): Promise<ChargeCategory[]>;
  findDistinctActiveVehicleTypes(): Promise<string[]>;
  findPaginated(query: PaginationQueryDto): Promise<PaginatedResult<Charge>>;
  getNextChargeId(): Promise<number>;
}
