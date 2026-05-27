import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLinesTable1779890000000 implements MigrationInterface {
  name = 'CreateLinesTable1779890000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "master"`);
    await queryRunner.query(`
      CREATE TABLE "master"."lines" (
        "id"            bigint              NOT NULL,
        "line_id"       integer             NOT NULL,
        "name"          character varying   NOT NULL,
        "code"          character varying   NOT NULL,
        "display_order" integer             NOT NULL DEFAULT 1,
        "description"   character varying,
        "status"        character varying   NOT NULL DEFAULT 'Active',
        "created_at"    TIMESTAMP           NOT NULL DEFAULT NOW(),
        "created_by"    character varying,
        "updated_at"    TIMESTAMP           NOT NULL DEFAULT NOW(),
        "is_deleted"    boolean             NOT NULL DEFAULT false,
        CONSTRAINT "PK_lines_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_lines_line_id" UNIQUE ("line_id"),
        CONSTRAINT "UQ_lines_code" UNIQUE ("code")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_LINES_LINE_ID" ON "master"."lines" ("line_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_LINES_CODE" ON "master"."lines" ("code")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "master"."IDX_LINES_CODE"`);
    await queryRunner.query(`DROP INDEX "master"."IDX_LINES_LINE_ID"`);
    await queryRunner.query(`DROP TABLE "master"."lines"`);
  }
}
