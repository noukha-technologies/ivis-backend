import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTestsTable1779870000000 implements MigrationInterface {
  name = 'CreateTestsTable1779870000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "master"`);
    await queryRunner.query(`
      CREATE TABLE "master"."tests" (
        "id"            bigint              NOT NULL,
        "test_id"       integer             NOT NULL,
        "name"          character varying   NOT NULL,
        "code"          character varying   NOT NULL,
        "status"        character varying   NOT NULL DEFAULT 'Active',
        "created_at"    TIMESTAMP           NOT NULL DEFAULT NOW(),
        "created_by"    character varying,
        "updated_at"    TIMESTAMP           NOT NULL DEFAULT NOW(),
        "is_deleted"    boolean             NOT NULL DEFAULT false,
        CONSTRAINT "PK_tests_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_tests_test_id" UNIQUE ("test_id"),
        CONSTRAINT "UQ_tests_code" UNIQUE ("code")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_TESTS_TEST_ID" ON "master"."tests" ("test_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_TESTS_CODE" ON "master"."tests" ("code")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "master"."IDX_TESTS_CODE"`);
    await queryRunner.query(`DROP INDEX "master"."IDX_TESTS_TEST_ID"`);
    await queryRunner.query(`DROP TABLE "master"."tests"`);
  }
}
