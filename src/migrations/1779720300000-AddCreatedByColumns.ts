import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCreatedByColumns1779720300000 implements MigrationInterface {
  name = 'AddCreatedByColumns1779720300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "core"."users"
      ADD COLUMN IF NOT EXISTS "created_by" character varying
    `);
    await queryRunner.query(`
      ALTER TABLE "master"."roles"
      ADD COLUMN IF NOT EXISTS "created_by" character varying
    `);
    await queryRunner.query(`
      ALTER TABLE "core"."user_sessions"
      ADD COLUMN IF NOT EXISTS "created_by" character varying
    `);
    await queryRunner.query(`
      ALTER TABLE "master"."vehicles"
      ADD COLUMN IF NOT EXISTS "created_by" character varying
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "master"."vehicles" DROP COLUMN IF EXISTS "created_by"`);
    await queryRunner.query(
      `ALTER TABLE "core"."user_sessions" DROP COLUMN IF EXISTS "created_by"`,
    );
    await queryRunner.query(`ALTER TABLE "master"."roles" DROP COLUMN IF EXISTS "created_by"`);
    await queryRunner.query(`ALTER TABLE "core"."users" DROP COLUMN IF EXISTS "created_by"`);
  }
}
