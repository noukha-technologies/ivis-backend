import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserRoleRelation1779705750827 implements MigrationInterface {
  name = 'AddUserRoleRelation1779705750827';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "core"."users" DROP COLUMN IF EXISTS "role"`);
    await queryRunner.query(`
      ALTER TABLE "core"."users"
      ADD COLUMN "role_id" bigint NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "core"."users"
      ADD CONSTRAINT "FK_users_role"
      FOREIGN KEY ("role_id") REFERENCES "master"."roles"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "core"."users" DROP CONSTRAINT IF EXISTS "FK_users_role"`,
    );
    await queryRunner.query(`ALTER TABLE "core"."users" DROP COLUMN "role_id"`);
    await queryRunner.query(`
      ALTER TABLE "core"."users"
      ADD COLUMN "role" character varying NOT NULL
    `);
  }
}
