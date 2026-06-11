import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddChassisNoAndMulkiyaIdToCustomers1781171000000 implements MigrationInterface {
  name = 'AddChassisNoAndMulkiyaIdToCustomers1781171000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "transaction"."customers"
      ADD COLUMN "chassis_no" character varying(64)
    `);

    await queryRunner.query(`
      ALTER TABLE "transaction"."customers"
      ADD COLUMN "mulkiya_id" character varying(64)
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_CUSTOMER_CHASSIS_NO" ON "transaction"."customers" ("chassis_no")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_CUSTOMER_MULKIYA_ID" ON "transaction"."customers" ("mulkiya_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "transaction"."IDX_CUSTOMER_MULKIYA_ID"`);
    await queryRunner.query(`DROP INDEX "transaction"."IDX_CUSTOMER_CHASSIS_NO"`);
    await queryRunner.query(`ALTER TABLE "transaction"."customers" DROP COLUMN "mulkiya_id"`);
    await queryRunner.query(`ALTER TABLE "transaction"."customers" DROP COLUMN "chassis_no"`);
  }
}
