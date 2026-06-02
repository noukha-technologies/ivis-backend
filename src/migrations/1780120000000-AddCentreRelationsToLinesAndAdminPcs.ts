import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCentreRelationsToLinesAndAdminPcs1780120000000 implements MigrationInterface {
  name = 'AddCentreRelationsToLinesAndAdminPcs1780120000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "master"."lines"
      ADD COLUMN "centre_id" bigint
    `);

    await queryRunner.query(`
      UPDATE "master"."lines" l
      SET "centre_id" = (
        SELECT c.id FROM "master"."centres" c
        WHERE c.is_deleted = false
        ORDER BY c.centre_id ASC
        LIMIT 1
      )
      WHERE l."centre_id" IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "master"."lines"
      ALTER COLUMN "centre_id" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "master"."lines"
      ADD CONSTRAINT "FK_lines_centre_id"
      FOREIGN KEY ("centre_id") REFERENCES "master"."centres"("id")
      ON DELETE RESTRICT
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_LINE_CENTRE_ID" ON "master"."lines" ("centre_id")
    `);

    await queryRunner.query(`
      ALTER TABLE "master"."admin_pcs"
      ADD COLUMN "centre_id" bigint
    `);

    await queryRunner.query(`
      UPDATE "master"."admin_pcs" ap
      SET "centre_id" = l."centre_id"
      FROM "master"."lines" l
      WHERE ap."line_id" = l.id AND ap."centre_id" IS NULL
    `);

    await queryRunner.query(`
      UPDATE "master"."admin_pcs" ap
      SET "centre_id" = (
        SELECT c.id FROM "master"."centres" c
        WHERE c.is_deleted = false
        ORDER BY c.centre_id ASC
        LIMIT 1
      )
      WHERE ap."centre_id" IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "master"."admin_pcs" DROP CONSTRAINT "FK_admin_pcs_line_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "master"."admin_pcs" DROP COLUMN "line_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "master"."admin_pcs"
      ALTER COLUMN "centre_id" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "master"."admin_pcs"
      ADD CONSTRAINT "FK_admin_pcs_centre_id"
      FOREIGN KEY ("centre_id") REFERENCES "master"."centres"("id")
      ON DELETE RESTRICT
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_ADMIN_PC_CENTRE_ID" ON "master"."admin_pcs" ("centre_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "master"."IDX_ADMIN_PC_CENTRE_ID"`);
    await queryRunner.query(`
      ALTER TABLE "master"."admin_pcs" DROP CONSTRAINT "FK_admin_pcs_centre_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "master"."admin_pcs"
      ADD COLUMN "line_id" bigint
    `);

    await queryRunner.query(`
      UPDATE "master"."admin_pcs" ap
      SET "line_id" = (
        SELECT l.id FROM "master"."lines" l
        WHERE l."centre_id" = ap."centre_id" AND l.is_deleted = false
        ORDER BY l.line_id ASC
        LIMIT 1
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "master"."admin_pcs" DROP COLUMN "centre_id"
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

    await queryRunner.query(`DROP INDEX "master"."IDX_LINE_CENTRE_ID"`);
    await queryRunner.query(`
      ALTER TABLE "master"."lines" DROP CONSTRAINT "FK_lines_centre_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "master"."lines" DROP COLUMN "centre_id"
    `);
  }
}
