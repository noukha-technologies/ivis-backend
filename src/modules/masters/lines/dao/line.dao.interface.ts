import { Line } from '../../../database/entity/line.entity';
import { PaginationQueryDto } from '../../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../../common/interfaces/pagination.interface';

export interface ILineDao {
  findActiveById(id: string): Promise<Line | null>;
  findByCode(code: string): Promise<Line | null>;
  findByLineId(lineId: number): Promise<Line | null>;
  findPaginated(query: PaginationQueryDto): Promise<PaginatedResult<Line>>;
  getNextLineId(): Promise<number>;
  save(line: Line): Promise<Line>;
}
