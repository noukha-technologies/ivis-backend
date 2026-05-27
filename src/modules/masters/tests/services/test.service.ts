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

  async create(createTestDto: CreateTestDto): Promise<Test> {
    this.logger.log(`Creating test with code: ${createTestDto.code}`, TestService.context);

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
      });
      const savedTest = await this.testDao.save(test);

      this.logger.log(`Test created with ID: ${savedTest.id}`, TestService.context);
      return savedTest;
    } catch (error) {
      if (error instanceof DuplicateResourceException) {
        throw error;
      }
      this.logger.error(
        `Failed to create test: ${(error as Error).message}`,
        (error as Error).stack,
        TestService.context,
      );
      throw new DatabaseException('Failed to create test. Please try again.');
    }
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<Test>> {
    this.logger.log(`Fetching tests — page: ${query.page}, limit: ${query.limit}`, TestService.context);

    try {
      return await this.testDao.findPaginated(query);
    } catch (error) {
      this.logger.error(
        `Failed to fetch tests: ${(error as Error).message}`,
        (error as Error).stack,
        TestService.context,
      );
      throw new DatabaseException('Failed to fetch tests. Please try again.');
    }
  }

  async findOne(id: string): Promise<Test> {
    this.logger.log(`Fetching test ID: ${id}`, TestService.context);

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
        `Failed to fetch test: ${(error as Error).message}`,
        (error as Error).stack,
        TestService.context,
      );
      throw new DatabaseException('Failed to fetch test. Please try again.');
    }
  }

  async findByCode(code: string): Promise<Test | null> {
    this.logger.log(`Lookup by code: ${code}`, TestService.context);

    try {
      return await this.testDao.findByCode(code);
    } catch (error) {
      this.logger.error(
        `Failed to find test by code: ${(error as Error).message}`,
        (error as Error).stack,
        TestService.context,
      );
      throw new DatabaseException('Failed to look up test by code.');
    }
  }

  async update(id: string, updateTestDto: UpdateTestDto): Promise<Test> {
    this.logger.log(`Updating test ID: ${id}`, TestService.context);

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

      this.logger.log(`Test updated ID: ${savedTest.id}`, TestService.context);
      return savedTest;
    } catch (error) {
      if (error instanceof ResourceNotFoundException || error instanceof DuplicateResourceException) {
        throw error;
      }
      this.logger.error(
        `Failed to update test: ${(error as Error).message}`,
        (error as Error).stack,
        TestService.context,
      );
      throw new DatabaseException('Failed to update test. Please try again.');
    }
  }

  async remove(id: string): Promise<void> {
    this.logger.log(`Deleting test ID: ${id}`, TestService.context);

    try {
      const test = await this.findOne(id);
      test.is_deleted = true;
      await this.testDao.save(test);
      this.logger.log(`Test soft-deleted ID: ${id}`, TestService.context);
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to delete test: ${(error as Error).message}`,
        (error as Error).stack,
        TestService.context,
      );
      throw new DatabaseException('Failed to delete test. Please try again.');
    }
  }
}
