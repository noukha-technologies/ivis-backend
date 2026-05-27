import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAdminPcsTable1779900000000 implements MigrationInterface {
  name = 'CreateAdminPcsTable1779900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "master"."admin_pcs" (
        "id"            bigint              NOT NULL,
        "admin_pc_id"   integer             NOT NULL,
        "name"          character varying   NOT NULL,
        "code"          character varying   NOT NULL,
        "ip_address"    character varying   NOT NULL,
        "line_id"       bigint              NOT NULL,
        "description"   character varying,
        "status"        character varying   NOT NULL DEFAULT 'Active',
        "created_at"    TIMESTAMP           NOT NULL DEFAULT NOW(),
        "created_by"    character varying,
        "updated_at"    TIMESTAMP           NOT NULL DEFAULT NOW(),
        "is_deleted"    boolean             NOT NULL DEFAULT false,
        CONSTRAINT "PK_admin_pcs_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_admin_pcs_admin_pc_id" UNIQUE ("admin_pc_id"),
        CONSTRAINT "UQ_admin_pcs_code" UNIQUE ("code"),
        CONSTRAINT "FK_admin_pcs_line_id" FOREIGN KEY ("line_id") REFERENCES "master"."lines"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ADMIN_PCS_ADMIN_PC_ID" ON "master"."admin_pcs" ("admin_pc_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ADMIN_PCS_CODE" ON "master"."admin_pcs" ("code")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "master"."IDX_ADMIN_PCS_CODE"`);
    await queryRunner.query(`DROP INDEX "master"."IDX_ADMIN_PCS_ADMIN_PC_ID"`);
    await queryRunner.query(`DROP TABLE "master"."admin_pcs"`);
  }
}
