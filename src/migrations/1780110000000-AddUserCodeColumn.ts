import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserCodeColumn1780110000000 implements MigrationInterface {
  name = 'AddUserCodeColumn1780110000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "core"."users"
      ADD COLUMN IF NOT EXISTS "user_code" character varying
    `);

    await queryRunner.query(`
      UPDATE "core"."users" u
      SET "user_code" = 'USR' || LPAD(u."user_id"::text, 4, '0')
      WHERE u."user_code" IS NULL OR TRIM(u."user_code") = ''
    `);

    await queryRunner.query(`
      ALTER TABLE "core"."users"
      ALTER COLUMN "user_code" SET NOT NULL
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_USER_USER_CODE"
      ON "core"."users" ("user_code")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "core"."IDX_USER_USER_CODE"`);
    await queryRunner.query(`ALTER TABLE "core"."users" DROP COLUMN IF EXISTS "user_code"`);
  }
}
