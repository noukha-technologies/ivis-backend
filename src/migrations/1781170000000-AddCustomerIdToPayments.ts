import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCustomerIdToPayments1781170000000 implements MigrationInterface {
  name = 'AddCustomerIdToPayments1781170000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "master"."payments"
      ADD COLUMN "customer_id" bigint
    `);

    await queryRunner.query(`
      UPDATE "master"."payments" p
      SET "customer_id" = c."id"
      FROM "transaction"."customers" c
      WHERE p."customer_phone" IS NOT NULL
        AND c."phone" = p."customer_phone"
        AND c."is_deleted" = false
    `);

    await queryRunner.query(`
      UPDATE "master"."payments" p
      SET "customer_id" = c."id"
      FROM "transaction"."customers" c
      WHERE p."customer_id" IS NULL
        AND p."name" = c."name"
        AND c."is_deleted" = false
    `);

    await queryRunner.query(`
      ALTER TABLE "master"."payments"
      ADD CONSTRAINT "FK_payments_customer_id"
        FOREIGN KEY ("customer_id")
        REFERENCES "transaction"."customers"("id")
        ON DELETE SET NULL
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_PAYMENT_CUSTOMER_ID" ON "master"."payments" ("customer_id")
    `);

    await queryRunner.query(`
      ALTER TABLE "master"."payments" DROP COLUMN "customer_phone"
    `);

    await queryRunner.query(`
      ALTER TABLE "master"."payments" DROP COLUMN "name"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "master"."payments"
      ADD COLUMN "name" character varying
    `);

    await queryRunner.query(`
      ALTER TABLE "master"."payments"
      ADD COLUMN "customer_phone" character varying
    `);

    await queryRunner.query(`
      UPDATE "master"."payments" p
      SET
        "name" = c."name",
        "customer_phone" = c."phone"
      FROM "transaction"."customers" c
      WHERE p."customer_id" = c."id"
    `);

    await queryRunner.query(`
      UPDATE "master"."payments"
      SET "name" = ''
      WHERE "name" IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "master"."payments"
      ALTER COLUMN "name" SET NOT NULL
    `);

    await queryRunner.query(`DROP INDEX "master"."IDX_PAYMENT_CUSTOMER_ID"`);

    await queryRunner.query(`
      ALTER TABLE "master"."payments"
      DROP CONSTRAINT "FK_payments_customer_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "master"."payments" DROP COLUMN "customer_id"
    `);
  }
}
