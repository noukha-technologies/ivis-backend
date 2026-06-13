import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAmountToPayments1781172000000 implements MigrationInterface {
  name = 'AddAmountToPayments1781172000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "master"."payments"
      ADD COLUMN "amount" numeric(12,2)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "master"."payments" DROP COLUMN "amount"
    `);
  }
}
