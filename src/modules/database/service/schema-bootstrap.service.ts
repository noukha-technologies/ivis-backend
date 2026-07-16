import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { AppLogger } from '../../../common/logger/app.logger';
import { CreateSchema1782000000000 } from '../../../migrations/1782000000000-CreateSchema';
import {
  ALTER_SCHEMA_VERSION,
  AlterSchema1782010000000,
} from '../../../migrations/1782010000000-AlterSchema';
import { OnboardingStatusDao } from '../dao/onboarding-status.dao';
import { OnboardingStatus } from '../entity/onboarding-status.entity';

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

    const currentVersion = String(ALTER_SCHEMA_VERSION);
    const status = await this.getStatusResilient();

    if (schemasPresent && status?.schema_version === currentVersion) {
      this.logger.log(
        `Schema already at version ${currentVersion} — skipping AlterSchema.`,
        'SchemaBootstrap',
      );
      return;
    }

    this.logger.log(
      'Running AlterSchema (schema version changed or not yet applied).',
      'SchemaBootstrap',
    );
    await this.runMigration(new AlterSchema1782010000000(), 'RUN_ALTER_SCHEMA');

    const refreshed = await this.onboardingStatusDao.ensureSingletonRow();
    await this.onboardingStatusDao.save({
      ...refreshed,
      schema_version: currentVersion,
      schema_initialized_at: refreshed.schema_initialized_at ?? new Date(),
    });

    this.logger.log('Schema bootstrap complete.', 'SchemaBootstrap');
  }

  // Reads the onboarding_status row without letting a missing schema_version
  // column (a DB that hasn't run this version of AlterSchema yet) abort boot —
  // treated the same as "no version recorded", which forces AlterSchema to run.
  private async getStatusResilient(): Promise<OnboardingStatus | null> {
    try {
      return await this.onboardingStatusDao.ensureSingletonRow();
    } catch {
      return null;
    }
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
