import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakePaymentAmountRequired1781173000000 implements MigrationInterface {
  name = 'MakePaymentAmountRequired1781173000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "master"."payments"
      SET "amount" = 0
      WHERE "amount" IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "master"."payments"
      ALTER COLUMN "amount" SET DEFAULT 0
    `);

    await queryRunner.query(`
      ALTER TABLE "master"."payments"
      ALTER COLUMN "amount" SET NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "master"."payments"
      ALTER COLUMN "amount" DROP NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "master"."payments"
      ALTER COLUMN "amount" DROP DEFAULT
    `);
  }
}
