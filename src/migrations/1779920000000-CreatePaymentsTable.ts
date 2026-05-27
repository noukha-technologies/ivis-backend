import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePaymentsTable1779920000000 implements MigrationInterface {
  name = 'CreatePaymentsTable1779920000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "master"."payments" (
        "id"            bigint              NOT NULL,
        "payment_id"    integer             NOT NULL,
        "name"          character varying   NOT NULL,
        "code"          character varying   NOT NULL,
        "status"        character varying   NOT NULL DEFAULT 'Active',
        "created_at"    TIMESTAMP           NOT NULL DEFAULT NOW(),
        "created_by"    character varying,
        "updated_at"    TIMESTAMP           NOT NULL DEFAULT NOW(),
        "is_deleted"    boolean             NOT NULL DEFAULT false,
        CONSTRAINT "PK_payments_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_payments_payment_id" UNIQUE ("payment_id"),
        CONSTRAINT "UQ_payments_code" UNIQUE ("code")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_PAYMENTS_PAYMENT_ID" ON "master"."payments" ("payment_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_PAYMENTS_CODE" ON "master"."payments" ("code")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "master"."IDX_PAYMENTS_CODE"`);
    await queryRunner.query(`DROP INDEX "master"."IDX_PAYMENTS_PAYMENT_ID"`);
    await queryRunner.query(`DROP TABLE "master"."payments"`);
  }
}
