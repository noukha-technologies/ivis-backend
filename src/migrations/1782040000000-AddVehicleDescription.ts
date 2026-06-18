import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVehicleDescription1782040000000 implements MigrationInterface {
  name = 'AddVehicleDescription1782040000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const [{ reg }] = await queryRunner.query(
      `SELECT to_regclass('master.vehicles') AS reg`,
    );
    if (!reg) {
      console.warn(
        '[AddVehicleDescription] Skipped: master.vehicles not found. Run npm run migration:alter first.',
      );
      return;
    }

    await queryRunner.query(`
      ALTER TABLE "master"."vehicles"
      ADD COLUMN IF NOT EXISTS "description" character varying(512)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const [{ reg }] = await queryRunner.query(
      `SELECT to_regclass('master.vehicles') AS reg`,
    );
    if (!reg) {
      return;
    }

    await queryRunner.query(`
      ALTER TABLE "master"."vehicles"
      DROP COLUMN IF EXISTS "description"
    `);
  }
}
