import { Injectable } from '@nestjs/common';
import { CreateTestDto, UpdateTestDto } from '../../../../common/dto/test.dto';
import { PaginationQueryDto } from '../../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../../common/interfaces/pagination.interface';
import {
  DatabaseException,
  DuplicateResourceException,
  ResourceNotFoundException,
} from '../../../../common/exceptions/custom.exception';
import { AppLogger } from '../../../../common/logger/app.logger';
import type { UserContext } from '../../../../common/dto/auth.dto';
import { getCreatedById } from '../../../../common/utils/created-by.util';
import { generateSnowflakeId } from '../../../../common/shared/snowflakeIdGeneration';
import { Test } from '../../../database/entity/test.entity';
import { TestDao } from '../../../database/dao/test.dao';
import { ITestService } from './test.service.interface';

@Injectable()
export class TestService implements ITestService {
  private static readonly context = 'TestService';

  constructor(
    private readonly testDao: TestDao,
    private readonly logger: AppLogger,
  ) {}

  async create(createTestDto: CreateTestDto, actor: UserContext): Promise<Test> {
    this.logger.log(`Creating test master with code: ${createTestDto.code}`, TestService.context);

    try {
      const existingCode = await this.testDao.findByCode(createTestDto.code);
      if (existingCode) {
        throw new DuplicateResourceException('Test', 'code', createTestDto.code);
      }

      let test_id = createTestDto.test_id;
      if (!test_id) {
        test_id = await this.testDao.getNextTestId();
      } else {
        const existingTestId = await this.testDao.findByTestId(test_id);
        if (existingTestId) {
          throw new DuplicateResourceException('Test', 'test_id', test_id);
        }
      }

      const test = this.testDao.create({
        id: generateSnowflakeId(),
        ...createTestDto,
        test_id,
        status: createTestDto.status || 'Active',
        created_by: getCreatedById(actor),
      });
      const savedTest = await this.testDao.save(test);

      this.logger.log(`Test master created with ID: ${savedTest.id}`, TestService.context);
      return savedTest;
    } catch (error) {
      if (error instanceof DuplicateResourceException) {
        throw error;
      }
      this.logger.error(
        `Failed to create test master: ${(error as Error).message}`,
        (error as Error).stack,
        TestService.context,
      );
      throw new DatabaseException('Failed to create test master. Please try again.');
    }
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<Test>> {
    this.logger.log(
      `Fetching test masters — page: ${query.page}, limit: ${query.limit}`,
      TestService.context,
    );

    try {
      return await this.testDao.findPaginated(query);
    } catch (error) {
      this.logger.error(
        `Failed to fetch test masters: ${(error as Error).message}`,
        (error as Error).stack,
        TestService.context,
      );
      throw new DatabaseException('Failed to fetch test masters. Please try again.');
    }
  }

  async findOne(id: string): Promise<Test> {
    this.logger.log(`Fetching test master ID: ${id}`, TestService.context);

    try {
      const test = await this.testDao.findActiveById(id);
      if (!test) {
        throw new ResourceNotFoundException('Test', id);
      }
      return test;
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to fetch test master: ${(error as Error).message}`,
        (error as Error).stack,
        TestService.context,
      );
      throw new DatabaseException('Failed to fetch test master. Please try again.');
    }
  }

  async update(id: string, updateTestDto: UpdateTestDto): Promise<Test> {
    this.logger.log(`Updating test master ID: ${id}`, TestService.context);

    try {
      const test = await this.findOne(id);

      if (updateTestDto.code && updateTestDto.code !== test.code) {
        const existingCode = await this.testDao.findByCode(updateTestDto.code);
        if (existingCode) {
          throw new DuplicateResourceException('Test', 'code', updateTestDto.code);
        }
      }

      const mergedTest = this.testDao.merge(test, updateTestDto);
      const savedTest = await this.testDao.save(mergedTest);

      this.logger.log(`Test master updated ID: ${savedTest.id}`, TestService.context);
      return savedTest;
    } catch (error) {
      if (error instanceof ResourceNotFoundException || error instanceof DuplicateResourceException) {
        throw error;
      }
      this.logger.error(
        `Failed to update test master: ${(error as Error).message}`,
        (error as Error).stack,
        TestService.context,
      );
      throw new DatabaseException('Failed to update test master. Please try again.');
    }
  }

  async remove(id: string): Promise<void> {
    this.logger.log(`Deleting test master ID: ${id}`, TestService.context);

    try {
      const test = await this.findOne(id);
      test.is_deleted = true;
      await this.testDao.save(test);
      this.logger.log(`Test master soft-deleted ID: ${id}`, TestService.context);
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to delete test master: ${(error as Error).message}`,
        (error as Error).stack,
        TestService.context,
      );
      throw new DatabaseException('Failed to delete test master. Please try again.');
    }
  }
}
