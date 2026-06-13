import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUniqueVinNoToVehicleMaster1781175000000 implements MigrationInterface {
  name = 'AddUniqueVinNoToVehicleMaster1781175000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_VEHICLE_VIN_NO"
        ON "master"."vehicles" ("vin_no")
        WHERE "is_deleted" = false AND "vin_no" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "master"."IDX_VEHICLE_VIN_NO"`);
  }
}
