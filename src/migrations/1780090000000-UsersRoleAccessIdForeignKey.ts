import { MigrationInterface, QueryRunner } from 'typeorm';

export class UsersRoleAccessIdForeignKey1780090000000 implements MigrationInterface {
  name = 'UsersRoleAccessIdForeignKey1780090000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "core"."users"
      ADD COLUMN IF NOT EXISTS "role_access_id" bigint
    `);

    await queryRunner.query(`
      UPDATE "core"."users" u
      SET "role_access_id" = ra."id"
      FROM "core"."role_access" ra
      WHERE ra."is_deleted" = false
        AND LOWER(TRIM(ra."role_name")) = LOWER(TRIM(u."role_name"))
        AND u."role_access_id" IS NULL
    `);

    await queryRunner.query(`
      UPDATE "core"."users" u
      SET "role_access_id" = (
        SELECT ra."id" FROM "core"."role_access" ra
        WHERE ra."is_deleted" = false AND LOWER(ra."role_name") = 'admin'
        ORDER BY ra."created_at" ASC
        LIMIT 1
      )
      WHERE u."role_access_id" IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "core"."users"
      ALTER COLUMN "role_access_id" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "core"."users" DROP CONSTRAINT IF EXISTS "FK_users_role_access_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "core"."users"
      ADD CONSTRAINT "FK_users_role_access_id"
      FOREIGN KEY ("role_access_id") REFERENCES "core"."role_access"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_USER_ROLE_ACCESS_ID"
      ON "core"."users" ("role_access_id")
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS "core"."IDX_USER_ROLE_NAME"`);
    await queryRunner.query(`
      ALTER TABLE "core"."users" DROP COLUMN IF EXISTS "role_name"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "core"."users"
      ADD COLUMN IF NOT EXISTS "role_name" character varying(64)
    `);

    await queryRunner.query(`
      UPDATE "core"."users" u
      SET "role_name" = ra."role_name"
      FROM "core"."role_access" ra
      WHERE u."role_access_id" = ra."id"
    `);

    await queryRunner.query(`
      UPDATE "core"."users"
      SET "role_name" = 'admin'
      WHERE "role_name" IS NULL OR TRIM("role_name") = ''
    `);

    await queryRunner.query(`
      ALTER TABLE "core"."users" ALTER COLUMN "role_name" SET NOT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_USER_ROLE_NAME" ON "core"."users" ("role_name")
    `);

    await queryRunner.query(`
      ALTER TABLE "core"."users" DROP CONSTRAINT IF EXISTS "FK_users_role_access_id"
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS "core"."IDX_USER_ROLE_ACCESS_ID"`);
    await queryRunner.query(`
      ALTER TABLE "core"."users" DROP COLUMN IF EXISTS "role_access_id"
    `);
  }
}
