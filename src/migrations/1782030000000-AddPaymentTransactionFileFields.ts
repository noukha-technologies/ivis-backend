import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentTransactionFileFields1782030000000 implements MigrationInterface {
  name = 'AddPaymentTransactionFileFields1782030000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "transaction"."payment_transactions"
      ADD COLUMN IF NOT EXISTS "payment_mode" character varying(64)
    `);
    await queryRunner.query(`
      ALTER TABLE "transaction"."payment_transactions"
      ADD COLUMN IF NOT EXISTS "capture_image_path" character varying(512)
    `);
    await queryRunner.query(`
      ALTER TABLE "transaction"."payment_transactions"
      ADD COLUMN IF NOT EXISTS "attachment_path" character varying(512)
    `);
    await queryRunner.query(`
      ALTER TABLE "transaction"."payment_transactions"
      ADD COLUMN IF NOT EXISTS "attachment_filename" character varying(256)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "transaction"."payment_transactions"
      DROP COLUMN IF EXISTS "attachment_filename"
    `);
    await queryRunner.query(`
      ALTER TABLE "transaction"."payment_transactions"
      DROP COLUMN IF EXISTS "attachment_path"
    `);
    await queryRunner.query(`
      ALTER TABLE "transaction"."payment_transactions"
      DROP COLUMN IF EXISTS "capture_image_path"
    `);
    await queryRunner.query(`
      ALTER TABLE "transaction"."payment_transactions"
      DROP COLUMN IF EXISTS "payment_mode"
    `);
  }
}
