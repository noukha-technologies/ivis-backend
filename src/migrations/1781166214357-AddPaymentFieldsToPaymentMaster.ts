import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPaymentFieldsToPaymentMaster1781166214357 implements MigrationInterface {
    name = 'AddPaymentFieldsToPaymentMaster1781166214357'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "master"."payments" ADD "payment_mode" character varying(64)`);
        await queryRunner.query(`ALTER TABLE "master"."payments" ADD "type" character varying(64)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "master"."payments" DROP COLUMN "type"`);
        await queryRunner.query(`ALTER TABLE "master"."payments" DROP COLUMN "payment_mode"`);
    }
}
