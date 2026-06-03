import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Master scope: User↔Centre 1:1, Camera↔Line 1:1, AdminPc↔Line 1:1.
 * Prerequisite: every active user has center_id set; no duplicate center_id among active users.
 */
export class MasterCentreLineRelations1780170000000 implements MigrationInterface {
  name = 'MasterCentreLineRelations1780170000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const nullCentreUsers: { count: string }[] = await queryRunner.query(`
      SELECT COUNT(*)::text AS count FROM "core"."users"
      WHERE is_deleted = false AND center_id IS NULL
    `);
    if (Number(nullCentreUsers[0]?.count) > 0) {
      throw new Error(
        'Migration aborted: assign center_id to all active users before running MasterCentreLineRelations.',
      );
    }

    const duplicateCentreUsers: { center_id: string; cnt: string }[] = await queryRunner.query(`
      SELECT center_id::text, COUNT(*)::text AS cnt
      FROM "core"."users"
      WHERE is_deleted = false AND center_id IS NOT NULL
      GROUP BY center_id
      HAVING COUNT(*) > 1
    `);
    if (duplicateCentreUsers.length > 0) {
      throw new Error(
        `Migration aborted: duplicate center_id assignments among users: ${duplicateCentreUsers.map((r) => r.center_id).join(', ')}`,
      );
    }

    await queryRunner.query(`
      ALTER TABLE "core"."users"
      ALTER COLUMN "center_id" SET NOT NULL
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_users_center_id"
      ON "core"."users" ("center_id")
      WHERE "is_deleted" = false
    `);

    const duplicateCameraLines: { line_id: string }[] = await queryRunner.query(`
      SELECT line_id::text FROM "master"."cameras"
      WHERE is_deleted = false
      GROUP BY line_id
      HAVING COUNT(*) > 1
    `);
    if (duplicateCameraLines.length > 0) {
      throw new Error(
        `Migration aborted: multiple active cameras on line_id(s): ${duplicateCameraLines.map((r) => r.line_id).join(', ')}`,
      );
    }

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_cameras_line_id"
      ON "master"."cameras" ("line_id")
      WHERE "is_deleted" = false
    `);

    await queryRunner.query(`
      ALTER TABLE "master"."admin_pcs"
      ADD COLUMN IF NOT EXISTS "line_id" bigint
    `);

    await queryRunner.query(`
      UPDATE "master"."admin_pcs" ap
      SET "line_id" = (
        SELECT l.id FROM "master"."lines" l
        WHERE l."centre_id" = ap."centre_id" AND l.is_deleted = false
        ORDER BY l.line_id ASC
        LIMIT 1
      )
      WHERE ap."line_id" IS NULL AND ap."centre_id" IS NOT NULL
    `);

    const orphanAdminPcs: { count: string }[] = await queryRunner.query(`
      SELECT COUNT(*)::text AS count FROM "master"."admin_pcs"
      WHERE is_deleted = false AND line_id IS NULL
    `);
    if (Number(orphanAdminPcs[0]?.count) > 0) {
      throw new Error(
        'Migration aborted: admin_pcs rows could not be mapped to a line. Create a line per centre first.',
      );
    }

    const duplicateAdminPcLines: { line_id: string }[] = await queryRunner.query(`
      SELECT line_id::text FROM "master"."admin_pcs"
      WHERE is_deleted = false AND line_id IS NOT NULL
      GROUP BY line_id
      HAVING COUNT(*) > 1
    `);
    if (duplicateAdminPcLines.length > 0) {
      throw new Error(
        `Migration aborted: multiple active admin PCs on line_id(s): ${duplicateAdminPcLines.map((r) => r.line_id).join(', ')}`,
      );
    }

    await queryRunner.query(`
      ALTER TABLE "master"."admin_pcs" DROP CONSTRAINT IF EXISTS "FK_admin_pcs_centre_id"
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS "master"."IDX_ADMIN_PC_CENTRE_ID"`);

    await queryRunner.query(`
      ALTER TABLE "master"."admin_pcs" DROP COLUMN IF EXISTS "centre_id"
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
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_admin_pcs_line_id"
      ON "master"."admin_pcs" ("line_id")
      WHERE "is_deleted" = false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "master"."UQ_admin_pcs_line_id"`);
    await queryRunner.query(`
      ALTER TABLE "master"."admin_pcs" DROP CONSTRAINT IF EXISTS "FK_admin_pcs_line_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "master"."admin_pcs"
      ADD COLUMN IF NOT EXISTS "centre_id" bigint
    `);

    await queryRunner.query(`
      UPDATE "master"."admin_pcs" ap
      SET "centre_id" = l."centre_id"
      FROM "master"."lines" l
      WHERE ap."line_id" = l.id
    `);

    await queryRunner.query(`
      ALTER TABLE "master"."admin_pcs" DROP COLUMN IF EXISTS "line_id"
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
      CREATE INDEX IF NOT EXISTS "IDX_ADMIN_PC_CENTRE_ID" ON "master"."admin_pcs" ("centre_id")
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS "master"."UQ_cameras_line_id"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "core"."UQ_users_center_id"`);

    await queryRunner.query(`
      ALTER TABLE "core"."users"
      ALTER COLUMN "center_id" DROP NOT NULL
    `);
  }
}
