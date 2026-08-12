import 'reflect-metadata';
import { loadEnv } from '../common/config/env.config';
import { AppDataSource } from '../modules/database/data-source';
import type { MigrationInterface, QueryRunner } from 'typeorm';

// Same per-environment resolution the app uses, so a script and the running
// app can never disagree about which database they target.
loadEnv();

/**
 * Runs a single named migration directly, bypassing TypeORM's pending-migration
 * queue so that only the named class is executed regardless of other pending
 * migrations in the history table.
 *
 * Usage (via npm scripts):
 *   npm run migration:create-schema
 *   npm run migration:alter
 *   npm run migration:wipe
 */
async function main(): Promise<void> {
  const targetName = process.argv[2];
  if (!targetName) {
    console.error('Usage: ts-node run-migration.ts <MigrationClassName>');
    process.exit(1);
  }

  const dataSource = await AppDataSource.initialize();
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();

  try {
    // dataSource.migrations holds instances; match by the `name` property each class sets.
    const instance = dataSource.migrations.find(
      (m: MigrationInterface) =>
        (m as MigrationInterface & { name?: string }).name === targetName,
    );

    if (!instance) {
      const available = dataSource.migrations
        .map(
          (m: MigrationInterface) =>
            (m as MigrationInterface & { name?: string }).name ??
            m.constructor.name,
        )
        .join('\n  ');
      console.error(
        `Migration "${targetName}" not found.\nAvailable:\n  ${available}`,
      );
      process.exit(1);
    }

    console.log(`[run-migration] Running: ${targetName}`);
    await queryRunner.startTransaction();
    try {
      await instance.up(queryRunner);
      await queryRunner.commitTransaction();
      console.log(`[run-migration] ${targetName} completed successfully.`);
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    }
  } finally {
    await queryRunner.release();
    await dataSource.destroy();
  }
}

main().catch((err: unknown) => {
  console.error('[run-migration] Failed:', err);
  process.exit(1);
});
