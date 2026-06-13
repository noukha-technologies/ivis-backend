import { MigrationInterface, QueryRunner } from 'typeorm';
import { generateSnowflakeId } from '../common/shared/snowflakeIdGeneration';

export class CreateAdminPcLineMappings1781174000000 implements MigrationInterface {
  name = 'CreateAdminPcLineMappings1781174000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "master"."admin_pc_line_mappings" (
        "id"            bigint              NOT NULL,
        "admin_pc_id"   bigint              NOT NULL,
        "line_id"       bigint              NOT NULL,
        "created_by"    character varying,
        "created_at"    TIMESTAMP           NOT NULL DEFAULT NOW(),
        "updated_at"    TIMESTAMP           NOT NULL DEFAULT NOW(),
        "is_deleted"    boolean             NOT NULL DEFAULT false,
        CONSTRAINT "PK_admin_pc_line_mappings_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_admin_pc_line_mappings_admin_pc_id"
          FOREIGN KEY ("admin_pc_id") REFERENCES "master"."admin_pcs"("id")
          ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "FK_admin_pc_line_mappings_line_id"
          FOREIGN KEY ("line_id") REFERENCES "master"."lines"("id")
          ON DELETE RESTRICT ON UPDATE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_ADMIN_PC_LINE_MAPPING_ADMIN_PC_ID"
      ON "master"."admin_pc_line_mappings" ("admin_pc_id")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_ADMIN_PC_LINE_MAPPING_ADMIN_PC_LINE"
      ON "master"."admin_pc_line_mappings" ("admin_pc_id", "line_id")
      WHERE "is_deleted" = false
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_ADMIN_PC_LINE_MAPPING_LINE"
      ON "master"."admin_pc_line_mappings" ("line_id")
      WHERE "is_deleted" = false
    `);

    const rows: { id: string; line_id: string }[] = await queryRunner.query(`
      SELECT "id", "line_id"
      FROM "master"."admin_pcs"
      WHERE "line_id" IS NOT NULL
        AND "is_deleted" = false
    `);

    for (const row of rows) {
      await queryRunner.query(
        `
        INSERT INTO "master"."admin_pc_line_mappings" ("id", "admin_pc_id", "line_id", "is_deleted")
        VALUES ($1, $2, $3, false)
        `,
        [generateSnowflakeId(), row.id, row.line_id],
      );
    }

    await queryRunner.query(`DROP INDEX IF EXISTS "master"."UQ_admin_pcs_line_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "master"."UQ_ADMIN_PC_LINE_ID"`);
    await queryRunner.query(`
      ALTER TABLE "master"."admin_pcs" DROP CONSTRAINT IF EXISTS "FK_admin_pcs_line_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "master"."admin_pcs" DROP COLUMN "line_id"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "master"."admin_pcs" ADD COLUMN "line_id" bigint
    `);

    await queryRunner.query(`
      UPDATE "master"."admin_pcs" pc
      SET "line_id" = (
        SELECT m."line_id"
        FROM "master"."admin_pc_line_mappings" m
        WHERE m."admin_pc_id" = pc."id" AND m."is_deleted" = false
        ORDER BY m."created_at" ASC
        LIMIT 1
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "master"."admin_pcs"
      ALTER COLUMN "line_id" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "master"."admin_pcs"
      ADD CONSTRAINT "FK_admin_pcs_line_id"
      FOREIGN KEY ("line_id") REFERENCES "master"."lines"("id")
      ON DELETE RESTRICT
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_admin_pcs_line_id"
      ON "master"."admin_pcs" ("line_id")
      WHERE "is_deleted" = false
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS "master"."UQ_ADMIN_PC_LINE_MAPPING_LINE"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "master"."UQ_ADMIN_PC_LINE_MAPPING_ADMIN_PC_LINE"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "master"."IDX_ADMIN_PC_LINE_MAPPING_ADMIN_PC_ID"`);
    await queryRunner.query(`DROP TABLE "master"."admin_pc_line_mappings"`);
  }
}
