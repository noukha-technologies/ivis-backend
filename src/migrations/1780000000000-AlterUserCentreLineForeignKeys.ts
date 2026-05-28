import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlterUserCentreLineForeignKeys1780000000000 implements MigrationInterface {
  name = 'AlterUserCentreLineForeignKeys1780000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "core"."users" DROP COLUMN IF EXISTS "center"`);
    await queryRunner.query(`ALTER TABLE "core"."users" DROP COLUMN IF EXISTS "line"`);
    await queryRunner.query(`ALTER TABLE "core"."users" DROP COLUMN IF EXISTS "center_id"`);
    await queryRunner.query(`ALTER TABLE "core"."users" DROP COLUMN IF EXISTS "line_id"`);

    await queryRunner.query(`
      ALTER TABLE "core"."users"
      ADD COLUMN "center_id" bigint
    `);
    await queryRunner.query(`
      ALTER TABLE "core"."users"
      ADD COLUMN "line_id" bigint
    `);
    await queryRunner.query(`
      ALTER TABLE "core"."users"
      ADD CONSTRAINT "FK_users_center_id"
      FOREIGN KEY ("center_id") REFERENCES "master"."centres"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "core"."users"
      ADD CONSTRAINT "FK_users_line_id"
      FOREIGN KEY ("line_id") REFERENCES "master"."lines"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "core"."users" DROP CONSTRAINT IF EXISTS "FK_users_line_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "core"."users" DROP CONSTRAINT IF EXISTS "FK_users_center_id"`,
    );
    await queryRunner.query(`ALTER TABLE "core"."users" DROP COLUMN IF EXISTS "line_id"`);
    await queryRunner.query(`ALTER TABLE "core"."users" DROP COLUMN IF EXISTS "center_id"`);
    await queryRunner.query(`
      ALTER TABLE "core"."users"
      ADD COLUMN "center" character varying
    `);
    await queryRunner.query(`
      ALTER TABLE "core"."users"
      ADD COLUMN "line" character varying
    `);
  }
}
