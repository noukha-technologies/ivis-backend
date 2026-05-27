import { CreateLineDto, UpdateLineDto } from '../../../../common/dto/line.dto';
import { PaginationQueryDto } from '../../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../../common/interfaces/pagination.interface';
import { Line } from '../../../database/entity/line.entity';

export interface ILineService {
  create(createLineDto: CreateLineDto): Promise<Line>;
  findAll(query: PaginationQueryDto): Promise<PaginatedResult<Line>>;
  findOne(id: string): Promise<Line>;
  findByCode(code: string): Promise<Line | null>;
  update(id: string, updateLineDto: UpdateLineDto): Promise<Line>;
  remove(id: string): Promise<void>;
}
