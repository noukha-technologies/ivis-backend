import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPaymentModeAndTypeToAppointment1781162440262 implements MigrationInterface {
    name = 'AddPaymentModeAndTypeToAppointment1781162440262'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // 1. Add columns as nullable first
        await queryRunner.query(`ALTER TABLE "transaction"."appointments" ADD "payment_mode" character varying(64)`);
        await queryRunner.query(`ALTER TABLE "transaction"."appointments" ADD "type" character varying(64)`);

        // 2. Set default values for existing rows
        await queryRunner.query(`UPDATE "transaction"."appointments" SET "payment_mode" = 'Cash', "type" = 'Standard'`);

        // 3. Alter columns to NOT NULL (without setting a permanent database DEFAULT constraint)
        await queryRunner.query(`ALTER TABLE "transaction"."appointments" ALTER COLUMN "payment_mode" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "transaction"."appointments" ALTER COLUMN "type" SET NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "transaction"."appointments" DROP COLUMN "type"`);
        await queryRunner.query(`ALTER TABLE "transaction"."appointments" DROP COLUMN "payment_mode"`);
    }
}
