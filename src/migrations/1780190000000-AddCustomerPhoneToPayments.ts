import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCustomerPhoneToPayments1780190000000 implements MigrationInterface {
  name = 'AddCustomerPhoneToPayments1780190000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "master"."payments"
      ADD COLUMN "customer_phone" character varying
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "master"."payments"
      DROP COLUMN "customer_phone"
    `);
  }
}
