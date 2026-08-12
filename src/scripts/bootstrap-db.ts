import 'reflect-metadata';
import { loadEnv } from '../common/config/env.config';
import { AppDataSource } from '../modules/database/data-source';
import type { DataSource, MigrationInterface, QueryRunner } from 'typeorm';

// Same per-environment resolution the app uses, so a script and the running
// app can never disagree about which database they target.
loadEnv();

/**
 * Bootstraps a fresh centre/central DB: checks whether core/master/transaction
 * schemas already exist on the connected database, and only if they're
 * missing, runs CreateSchema then AlterSchema to stand them up. If the
 * schemas already exist, only AlterSchema is (re)applied — CreateSchema is
 * destructive (drops and recreates from scratch) and must never run against
 * a DB that already has data.
 *
 * Usage:
 *   npm run bootstrap:db
 */
const REQUIRED_SCHEMAS = ['core', 'master', 'transaction'];

async function schemaExists(
  queryRunner: QueryRunner,
  schema: string,
): Promise<boolean> {
  const rows: Array<{ exists: boolean }> = await queryRunner.query(
    `SELECT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = $1) AS "exists"`,
    [schema],
  );
  return rows[0]?.exists === true;
}

async function runMigration(
  dataSource: DataSource,
  queryRunner: QueryRunner,
  targetName: string,
): Promise<void> {
  const instance = dataSource.migrations.find(
    (m: MigrationInterface) =>
      (m as MigrationInterface & { name?: string }).name === targetName,
  );
  if (!instance) {
    throw new Error(`Migration "${targetName}" not found.`);
  }

  console.log(`[bootstrap-db] Running: ${targetName}`);
  await queryRunner.startTransaction();
  try {
    await instance.up(queryRunner);
    await queryRunner.commitTransaction();
    console.log(`[bootstrap-db] ${targetName} completed successfully.`);
  } catch (err) {
    await queryRunner.rollbackTransaction();
    throw err;
  }
}

async function main(): Promise<void> {
  const dataSource = await AppDataSource.initialize();
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();

  try {
    const missing: string[] = [];
    for (const schema of REQUIRED_SCHEMAS) {
      if (!(await schemaExists(queryRunner, schema))) {
        missing.push(schema);
      }
    }

    if (missing.length === REQUIRED_SCHEMAS.length) {
      console.log(
        `[bootstrap-db] No schemas found (${REQUIRED_SCHEMAS.join(', ')}) — running CreateSchema.`,
      );
      process.env.RUN_CREATE_SCHEMA = 'true';
      await runMigration(dataSource, queryRunner, 'CreateSchema1782000000000');
    } else if (missing.length > 0) {
      throw new Error(
        `Database is in a partial state — missing schema(s) [${missing.join(', ')}] but others already exist. ` +
          `Refusing to run CreateSchema (destructive) automatically; resolve manually.`,
      );
    } else {
      console.log(
        `[bootstrap-db] All required schemas already exist (${REQUIRED_SCHEMAS.join(', ')}) — skipping CreateSchema.`,
      );
    }

    process.env.RUN_ALTER_SCHEMA = 'true';
    await runMigration(dataSource, queryRunner, 'AlterSchema1782010000000');

    console.log('[bootstrap-db] Database is ready.');
  } finally {
    await queryRunner.release();
    await dataSource.destroy();
  }
}

main().catch((err: unknown) => {
  console.error('[bootstrap-db] Failed:', err);
  process.exit(1);
});
