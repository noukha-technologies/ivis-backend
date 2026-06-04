import type { UserContext } from '../../../../common/dto/auth.dto';
import { CreateLineDto, UpdateLineDto } from '../../../../common/dto/line.dto';
import { LineListQueryDto } from '../../../../common/dto/line-list-query.dto';
import { PaginatedResult } from '../../../../common/interfaces/pagination.interface';
import { Line } from '../../../database/entity/line.entity';

export interface ILineService {
  create(createLineDto: CreateLineDto, actor: UserContext): Promise<Line>;
  findAll(query: LineListQueryDto): Promise<PaginatedResult<Line>>;
  findOne(id: string): Promise<Line>;
  findByCode(code: string): Promise<Line | null>;
  update(id: string, updateLineDto: UpdateLineDto): Promise<Line>;
  remove(id: string): Promise<void>;
}
