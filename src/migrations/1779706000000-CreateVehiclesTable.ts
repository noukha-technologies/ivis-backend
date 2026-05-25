import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateVehiclesTable1779706000000 implements MigrationInterface {
  name = 'CreateVehiclesTable1779706000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "master"`);
    await queryRunner.query(`
      CREATE TABLE "master"."vehicles" (
        "id"            bigint              NOT NULL,
        "vehicle_id"    integer             NOT NULL,
        "plate_number"  character varying   NOT NULL,
        "vehicle_type"  character varying   NOT NULL,
        "vehicle_color" character varying   NOT NULL,
        "vehicle_brand" character varying   NOT NULL,
        "created_at"    TIMESTAMP           NOT NULL DEFAULT NOW(),
        "created_by"    character varying,
        "updated_at"    TIMESTAMP           NOT NULL DEFAULT NOW(),
        "is_deleted"    boolean             NOT NULL DEFAULT false,
        CONSTRAINT "PK_vehicle_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_vehicle_vehicle_id" UNIQUE ("vehicle_id"),
        CONSTRAINT "UQ_vehicle_plate_number" UNIQUE ("plate_number")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_VEHICLE_VEHICLE_ID" ON "master"."vehicles" ("vehicle_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_VEHICLE_PLATE_NUMBER" ON "master"."vehicles" ("plate_number")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "master"."IDX_VEHICLE_PLATE_NUMBER"`);
    await queryRunner.query(`DROP INDEX "master"."IDX_VEHICLE_VEHICLE_ID"`);
    await queryRunner.query(`DROP TABLE "master"."vehicles"`);
  }
}
