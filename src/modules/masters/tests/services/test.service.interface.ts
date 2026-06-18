import type { UserContext } from '../../../../common/dto/auth.dto';
import { CreateTestDto, UpdateTestDto } from '../../../../common/dto/test.dto';
import { PaginationQueryDto } from '../../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../../common/interfaces/pagination.interface';
import { Test } from '../../../database/entity/test.entity';

export interface ITestService {
  create(createTestDto: CreateTestDto, actor: UserContext): Promise<Test>;
  findAll(query: PaginationQueryDto): Promise<PaginatedResult<Test>>;
  findOne(id: string): Promise<Test>;
  update(id: string, updateTestDto: UpdateTestDto): Promise<Test>;
  remove(id: string): Promise<void>;
}
