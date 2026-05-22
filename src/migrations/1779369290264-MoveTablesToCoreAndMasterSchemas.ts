import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * For databases that already ran migrations with "users" / "masters" schemas.
 * Safe to run on fresh DBs (no-op when old schemas do not exist).
 */
export class MoveTablesToCoreAndMasterSchemas1779369290264 implements MigrationInterface {
  name = 'MoveTablesToCoreAndMasterSchemas1779369290264';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "core"`);
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "master"`);

    const hasUsersSchema = await queryRunner.query(`
      SELECT 1 FROM information_schema.schemata WHERE schema_name = 'users' LIMIT 1
    `);
    if (hasUsersSchema.length > 0) {
      await queryRunner.query(`ALTER TABLE IF EXISTS "users"."users" SET SCHEMA "core"`);
      await queryRunner.query(
        `ALTER TABLE IF EXISTS "users"."user_sessions" SET SCHEMA "core"`,
      );
      await queryRunner.query(`DROP SCHEMA IF EXISTS "users" CASCADE`);
    }

    const hasMastersSchema = await queryRunner.query(`
      SELECT 1 FROM information_schema.schemata WHERE schema_name = 'masters' LIMIT 1
    `);
    if (hasMastersSchema.length > 0) {
      await queryRunner.query(`ALTER TABLE IF EXISTS "masters"."roles" SET SCHEMA "master"`);
      await queryRunner.query(`DROP SCHEMA IF EXISTS "masters" CASCADE`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "users"`);
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "masters"`);
    await queryRunner.query(`ALTER TABLE IF EXISTS "core"."users" SET SCHEMA "users"`);
    await queryRunner.query(
      `ALTER TABLE IF EXISTS "core"."user_sessions" SET SCHEMA "users"`,
    );
    await queryRunner.query(`ALTER TABLE IF EXISTS "master"."roles" SET SCHEMA "masters"`);
  }
}
