import { MigrationInterface, QueryRunner } from 'typeorm';
import { generateSnowflakeId } from '../common/shared/snowflakeIdGeneration';

export class CreateUserLineMappings1780100000000 implements MigrationInterface {
  name = 'CreateUserLineMappings1780100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "core"."user_line_mappings" (
        "id"          bigint              NOT NULL,
        "user_id"     bigint              NOT NULL,
        "line_id"     bigint              NOT NULL,
        "created_by"  character varying,
        "created_at"  TIMESTAMP           NOT NULL DEFAULT NOW(),
        "updated_at"  TIMESTAMP           NOT NULL DEFAULT NOW(),
        "is_deleted"  boolean             NOT NULL DEFAULT false,
        CONSTRAINT "PK_user_line_mappings_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_user_line_mappings_user_id"
          FOREIGN KEY ("user_id") REFERENCES "core"."users"("id")
          ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "FK_user_line_mappings_line_id"
          FOREIGN KEY ("line_id") REFERENCES "master"."lines"("id")
          ON DELETE RESTRICT ON UPDATE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_USER_LINE_MAPPING_USER_ID"
      ON "core"."user_line_mappings" ("user_id")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_USER_LINE_MAPPING_USER_LINE"
      ON "core"."user_line_mappings" ("user_id", "line_id")
      WHERE "is_deleted" = false
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_USER_LINE_MAPPING_LINE"
      ON "core"."user_line_mappings" ("line_id")
      WHERE "is_deleted" = false
    `);

    const rows: { id: string; line_id: string }[] = await queryRunner.query(`
      SELECT u."id", u."line_id"
      FROM "core"."users" u
      WHERE u."line_id" IS NOT NULL
        AND u."is_deleted" = false
    `);

    for (const row of rows) {
      await queryRunner.query(
        `
        INSERT INTO "core"."user_line_mappings" ("id", "user_id", "line_id", "is_deleted")
        VALUES ($1, $2, $3, false)
        `,
        [generateSnowflakeId(), row.id, row.line_id],
      );
    }

    await queryRunner.query(`
      ALTER TABLE "core"."users" DROP CONSTRAINT IF EXISTS "FK_users_line_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "core"."users" DROP COLUMN IF EXISTS "line_id"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "core"."users" ADD COLUMN IF NOT EXISTS "line_id" bigint
    `);

    await queryRunner.query(`
      UPDATE "core"."users" u
      SET "line_id" = (
        SELECT m."line_id" FROM "core"."user_line_mappings" m
        WHERE m."user_id" = u."id" AND m."is_deleted" = false
        ORDER BY m."created_at" ASC
        LIMIT 1
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "core"."users"
      ADD CONSTRAINT "FK_users_line_id"
      FOREIGN KEY ("line_id") REFERENCES "master"."lines"("id")
      ON DELETE SET NULL ON UPDATE CASCADE
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS "core"."UQ_USER_LINE_MAPPING_LINE"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "core"."UQ_USER_LINE_MAPPING_USER_LINE"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "core"."IDX_USER_LINE_MAPPING_USER_ID"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "core"."user_line_mappings"`);
  }
}
