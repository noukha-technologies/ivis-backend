import { DeepPartial } from 'typeorm';
import { PaginationQueryDto } from '../../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../../common/interfaces/pagination.interface';
import { Test } from '../../../database/entity/test.entity';

export interface ITestDao {
  create(entityLike: DeepPartial<Test>): Test;
  save(test: Test): Promise<Test>;
  merge(test: Test, entityLike: DeepPartial<Test>): Test;
  findActiveById(id: string): Promise<Test | null>;
  findByCode(code: string): Promise<Test | null>;
  findByTestId(testId: number): Promise<Test | null>;
  findPaginated(query: PaginationQueryDto): Promise<PaginatedResult<Test>>;
  getNextTestId(): Promise<number>;
}
