import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCentresTable1779880000000 implements MigrationInterface {
  name = 'CreateCentresTable1779880000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "master"`);
    await queryRunner.query(`
      CREATE TABLE "master"."centres" (
        "id"            bigint              NOT NULL,
        "centre_id"     integer             NOT NULL,
        "name"          character varying   NOT NULL,
        "code"          character varying   NOT NULL,
        "description"   character varying,
        "status"        character varying   NOT NULL DEFAULT 'Active',
        "created_at"    TIMESTAMP           NOT NULL DEFAULT NOW(),
        "created_by"    character varying,
        "updated_at"    TIMESTAMP           NOT NULL DEFAULT NOW(),
        "is_deleted"    boolean             NOT NULL DEFAULT false,
        CONSTRAINT "PK_centres_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_centres_centre_id" UNIQUE ("centre_id"),
        CONSTRAINT "UQ_centres_code" UNIQUE ("code")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_CENTRES_CENTRE_ID" ON "master"."centres" ("centre_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_CENTRES_CODE" ON "master"."centres" ("code")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "master"."IDX_CENTRES_CODE"`);
    await queryRunner.query(`DROP INDEX "master"."IDX_CENTRES_CENTRE_ID"`);
    await queryRunner.query(`DROP TABLE "master"."centres"`);
  }
}
