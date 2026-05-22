import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMastersSchemaAndRolesTable1779369290261 implements MigrationInterface {
  name = 'CreateMastersSchemaAndRolesTable1779369290261';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "master"`);
    await queryRunner.query(`
      CREATE TABLE "master"."roles" (
        "id"          bigint              NOT NULL,
        "role_name"   character varying   NOT NULL,
        "description" character varying,
        "is_deleted"  boolean             NOT NULL DEFAULT false,
        "created_at"  TIMESTAMP           NOT NULL DEFAULT NOW(),
        "updated_at"  TIMESTAMP           NOT NULL DEFAULT NOW(),
        CONSTRAINT "UQ_ROLE_ROLE_NAME" UNIQUE ("role_name"),
        CONSTRAINT "PK_ROLE_ID" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ROLE_ROLE_NAME" ON "master"."roles" ("role_name")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "master"."IDX_ROLE_ROLE_NAME"`);
    await queryRunner.query(`DROP TABLE "master"."roles"`);
    await queryRunner.query(`DROP SCHEMA IF EXISTS "master" CASCADE`);
  }
}
