import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ensures core.roles.role_id is assigned by the database (sequence default), not API input.
 */
export class RoleIdAutoIncrement1780160000000 implements MigrationInterface {
  name = 'RoleIdAutoIncrement1780160000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasRoles = await queryRunner.query(
      `SELECT to_regclass('core.roles') AS regclass`,
    );
    if (!hasRoles[0]?.regclass) {
      return;
    }

    await queryRunner.query(`
      CREATE SEQUENCE IF NOT EXISTS "core"."roles_role_id_seq"
      OWNED BY "core"."roles"."role_id"
    `);

    await queryRunner.query(`
      SELECT setval(
        '"core"."roles_role_id_seq"',
        COALESCE((SELECT MAX("role_id") FROM "core"."roles"), 0) + 1,
        false
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "core"."roles"
      ALTER COLUMN "role_id" SET DEFAULT nextval('"core"."roles_role_id_seq"')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasRoles = await queryRunner.query(
      `SELECT to_regclass('core.roles') AS regclass`,
    );
    if (!hasRoles[0]?.regclass) {
      return;
    }

    await queryRunner.query(`
      ALTER TABLE "core"."roles"
      ALTER COLUMN "role_id" DROP DEFAULT
    `);
    await queryRunner.query(`DROP SEQUENCE IF EXISTS "core"."roles_role_id_seq"`);
  }
}
