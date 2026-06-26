import { ChargeCategory } from '../../../database/entity/charge-category.entity';
import { PaginationQueryDto } from '../../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../../common/interfaces/pagination.interface';

export interface IChargeCategoryDao {
  findActiveById(id: string): Promise<ChargeCategory | null>;
  findPaginated(query: PaginationQueryDto): Promise<PaginatedResult<ChargeCategory>>;
  getNextCategoryId(): Promise<number>;
}
