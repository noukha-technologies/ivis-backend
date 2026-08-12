import type { UserContext } from '../../../../common/dto/auth.dto';
import {
  CreateCentreDto,
  UpdateCentreDto,
} from '../../../../common/dto/centre.dto';
import { PaginationQueryDto } from '../../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../../common/interfaces/pagination.interface';
import { Centre } from '../../../database/entity/centre.entity';

export interface ICentreService {
  create(createCentreDto: CreateCentreDto, actor: UserContext): Promise<Centre>;
  findAll(query: PaginationQueryDto): Promise<PaginatedResult<Centre>>;
  findOne(id: string): Promise<Centre>;
  findByCode(code: string): Promise<Centre | null>;
  update(
    id: string,
    updateCentreDto: UpdateCentreDto,
    actor?: UserContext,
  ): Promise<Centre>;
  remove(id: string): Promise<void>;
}
