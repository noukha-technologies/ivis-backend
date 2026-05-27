import { Test } from '../../../database/entity/test.entity';
import { PaginationQueryDto } from '../../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../../common/interfaces/pagination.interface';

export interface ITestDao {
  findActiveById(id: string): Promise<Test | null>;
  findByCode(code: string): Promise<Test | null>;
  findByTestId(testId: number): Promise<Test | null>;
  findPaginated(query: PaginationQueryDto): Promise<PaginatedResult<Test>>;
  getNextTestId(): Promise<number>;
}
