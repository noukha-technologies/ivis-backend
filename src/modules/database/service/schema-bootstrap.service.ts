import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { AppLogger } from '../../../common/logger/app.logger';
import { CreateSchema1782000000000 } from '../../../migrations/1782000000000-CreateSchema';
import { AlterSchema1782010000000 } from '../../../migrations/1782010000000-AlterSchema';
import { OnboardingStatusDao } from '../dao/onboarding-status.dao';

/**
 * Runs schema bootstrap (CreateSchema + AlterSchema) unconditionally at app
 * startup, before the server accepts HTTP traffic — decoupled from login
 * entirely (see Onboarding Sync plan). Fails fast: a thrown error here must
 * abort process startup rather than let the app serve traffic against
 * schema in an unknown state.
 */
@Injectable()
export class SchemaBootstrapService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly onboardingStatusDao: OnboardingStatusDao,
    private readonly logger: AppLogger,
  ) {}

  async run(): Promise<void> {
    const schemasPresent = await this.anySchemaExists();

    if (!schemasPresent) {
      this.logger.log(
        'No core/master/transaction schemas found — running CreateSchema.',
        'SchemaBootstrap',
      );
      await this.runMigration(
        new CreateSchema1782000000000(),
        'RUN_CREATE_SCHEMA',
      );
    }

    this.logger.log('Running AlterSchema (idempotent).', 'SchemaBootstrap');
    await this.runMigration(new AlterSchema1782010000000(), 'RUN_ALTER_SCHEMA');

    const status = await this.onboardingStatusDao.ensureSingletonRow();
    if (!status.schema_initialized_at) {
      await this.onboardingStatusDao.save({
        ...status,
        schema_initialized_at: new Date(),
      });
    }

    this.logger.log('Schema bootstrap complete.', 'SchemaBootstrap');
  }

  private async anySchemaExists(): Promise<boolean> {
    const rows: Array<{ schema_name: string }> = await this.dataSource.query(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name IN ('core', 'master', 'transaction')`,
    );
    return rows.length > 0;
  }

  private async runMigration(
    migration: { up: (queryRunner: import('typeorm').QueryRunner) => Promise<void> },
    guardEnvVar: 'RUN_CREATE_SCHEMA' | 'RUN_ALTER_SCHEMA',
  ): Promise<void> {
    const previousValue = process.env[guardEnvVar];
    process.env[guardEnvVar] = 'true';

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await migration.up(queryRunner);
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
      if (previousValue === undefined) {
        delete process.env[guardEnvVar];
      } else {
        process.env[guardEnvVar] = previousValue;
      }
    }
  }
}
