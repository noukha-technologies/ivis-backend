import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlterVehicleMasterAndCreateVehicleRecords1780020000000
  implements MigrationInterface
{
  name = 'AlterVehicleMasterAndCreateVehicleRecords1780020000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "core"."vehicle_records" (
        "id"                  bigint              NOT NULL,
        "vehicle_record_id"   integer             NOT NULL,
        "plate_number"        character varying(32) NOT NULL,
        "chassis_no"          character varying(64),
        "vehicle_make"        character varying(64),
        "vehicle_model"       character varying(64),
        "vehicle_type"        character varying(64),
        "plate_color"         character varying(64),
        "vehicle_color"       character varying(64),
        "vehicle_master_id"   bigint,
        "created_by"          character varying,
        "created_at"          TIMESTAMP           NOT NULL DEFAULT NOW(),
        "updated_at"          TIMESTAMP           NOT NULL DEFAULT NOW(),
        "is_deleted"          boolean             NOT NULL DEFAULT false,
        CONSTRAINT "PK_vehicle_records_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_vehicle_records_vehicle_record_id" UNIQUE ("vehicle_record_id"),
        CONSTRAINT "UQ_vehicle_records_plate_number" UNIQUE ("plate_number"),
        CONSTRAINT "FK_vehicle_records_vehicle_master_id"
          FOREIGN KEY ("vehicle_master_id")
          REFERENCES "master"."vehicles"("id")
          ON DELETE SET NULL
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_VEHICLE_RECORD_VEHICLE_RECORD_ID" ON "core"."vehicle_records" ("vehicle_record_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_VEHICLE_RECORD_PLATE_NUMBER" ON "core"."vehicle_records" ("plate_number")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_VEHICLE_RECORD_CHASSIS_NO" ON "core"."vehicle_records" ("chassis_no")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_VEHICLE_RECORD_VEHICLE_MASTER_ID" ON "core"."vehicle_records" ("vehicle_master_id")`,
    );

    await queryRunner.query(`
      INSERT INTO "core"."vehicle_records" (
        "id",
        "vehicle_record_id",
        "plate_number",
        "vehicle_type",
        "vehicle_color",
        "vehicle_make",
        "created_by",
        "created_at",
        "updated_at",
        "is_deleted"
      )
      SELECT
        "id",
        "vehicle_id",
        "plate_number",
        "vehicle_type",
        "vehicle_color",
        "vehicle_brand",
        "created_by",
        "created_at",
        "updated_at",
        "is_deleted"
      FROM "master"."vehicles"
    `);

    await queryRunner.query(
      `ALTER TABLE "core"."customers" DROP CONSTRAINT IF EXISTS "FK_customers_primary_vehicle_id"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "core"."IDX_CUSTOMER_PRIMARY_VEHICLE_ID"`);
    await queryRunner.query(`
      ALTER TABLE "core"."customers"
      RENAME COLUMN "primary_vehicle_id" TO "primary_vehicle_record_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "core"."customers"
      ADD CONSTRAINT "FK_customers_primary_vehicle_record_id"
        FOREIGN KEY ("primary_vehicle_record_id")
        REFERENCES "core"."vehicle_records"("id")
        ON DELETE SET NULL
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_CUSTOMER_PRIMARY_VEHICLE_RECORD_ID" ON "core"."customers" ("primary_vehicle_record_id")`,
    );

    await queryRunner.query(`DELETE FROM "master"."vehicles"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "master"."IDX_VEHICLE_PLATE_NUMBER"`);
    await queryRunner.query(
      `ALTER TABLE "master"."vehicles" DROP CONSTRAINT IF EXISTS "UQ_vehicle_plate_number"`,
    );

    await queryRunner.query(`ALTER TABLE "master"."vehicles" DROP COLUMN IF EXISTS "plate_number"`);
    await queryRunner.query(`ALTER TABLE "master"."vehicles" DROP COLUMN IF EXISTS "vehicle_type"`);
    await queryRunner.query(`ALTER TABLE "master"."vehicles" DROP COLUMN IF EXISTS "vehicle_color"`);
    await queryRunner.query(`ALTER TABLE "master"."vehicles" DROP COLUMN IF EXISTS "vehicle_brand"`);

    await queryRunner.query(`
      ALTER TABLE "master"."vehicles"
      ADD COLUMN "name" character varying(128) NOT NULL DEFAULT 'Unnamed Vehicle Type'
    `);
    await queryRunner.query(`
      ALTER TABLE "master"."vehicles"
      ADD COLUMN "code" character varying(64) NOT NULL DEFAULT 'VT-UNSET'
    `);
    await queryRunner.query(`
      ALTER TABLE "master"."vehicles"
      ADD COLUMN "vin_no" character varying(64)
    `);
    await queryRunner.query(`
      ALTER TABLE "master"."vehicles"
      ADD COLUMN "description" character varying(512)
    `);
    await queryRunner.query(`
      ALTER TABLE "master"."vehicles"
      ADD COLUMN "status" character varying(32) NOT NULL DEFAULT 'Active'
    `);

    await queryRunner.query(`
      ALTER TABLE "master"."vehicles"
      ALTER COLUMN "name" DROP DEFAULT
    `);
    await queryRunner.query(`
      ALTER TABLE "master"."vehicles"
      ALTER COLUMN "code" DROP DEFAULT
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_VEHICLE_CODE" ON "master"."vehicles" ("code")`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."vehicles" ADD CONSTRAINT "UQ_vehicle_code" UNIQUE ("code")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "master"."vehicles" DROP CONSTRAINT IF EXISTS "UQ_vehicle_code"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "master"."IDX_VEHICLE_CODE"`);

    await queryRunner.query(`ALTER TABLE "master"."vehicles" DROP COLUMN IF EXISTS "status"`);
    await queryRunner.query(`ALTER TABLE "master"."vehicles" DROP COLUMN IF EXISTS "description"`);
    await queryRunner.query(`ALTER TABLE "master"."vehicles" DROP COLUMN IF EXISTS "vin_no"`);
    await queryRunner.query(`ALTER TABLE "master"."vehicles" DROP COLUMN IF EXISTS "code"`);
    await queryRunner.query(`ALTER TABLE "master"."vehicles" DROP COLUMN IF EXISTS "name"`);

    await queryRunner.query(`
      ALTER TABLE "master"."vehicles"
      ADD COLUMN IF NOT EXISTS "plate_number" character varying
    `);
    await queryRunner.query(`
      ALTER TABLE "master"."vehicles"
      ADD COLUMN IF NOT EXISTS "vehicle_type" character varying
    `);
    await queryRunner.query(`
      ALTER TABLE "master"."vehicles"
      ADD COLUMN IF NOT EXISTS "vehicle_color" character varying
    `);
    await queryRunner.query(`
      ALTER TABLE "master"."vehicles"
      ADD COLUMN IF NOT EXISTS "vehicle_brand" character varying
    `);

    await queryRunner.query(`
      UPDATE "master"."vehicles" v
      SET
        "plate_number" = r."plate_number",
        "vehicle_type" = COALESCE(r."vehicle_type", 'Unknown'),
        "vehicle_color" = COALESCE(r."vehicle_color", 'Unknown'),
        "vehicle_brand" = COALESCE(r."vehicle_make", 'Unknown')
      FROM "core"."vehicle_records" r
      WHERE r."id" = v."id"
    `);

    await queryRunner.query(`
      ALTER TABLE "master"."vehicles"
      ALTER COLUMN "plate_number" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "master"."vehicles"
      ALTER COLUMN "vehicle_type" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "master"."vehicles"
      ALTER COLUMN "vehicle_color" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "master"."vehicles"
      ALTER COLUMN "vehicle_brand" SET NOT NULL
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_VEHICLE_PLATE_NUMBER" ON "master"."vehicles" ("plate_number")`,
    );

    await queryRunner.query(
      `ALTER TABLE "core"."customers" DROP CONSTRAINT IF EXISTS "FK_customers_primary_vehicle_record_id"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "core"."IDX_CUSTOMER_PRIMARY_VEHICLE_RECORD_ID"`);
    await queryRunner.query(`
      ALTER TABLE "core"."customers"
      RENAME COLUMN "primary_vehicle_record_id" TO "primary_vehicle_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "core"."customers"
      ADD CONSTRAINT "FK_customers_primary_vehicle_id"
        FOREIGN KEY ("primary_vehicle_id")
        REFERENCES "master"."vehicles"("id")
        ON DELETE SET NULL
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_CUSTOMER_PRIMARY_VEHICLE_ID" ON "core"."customers" ("primary_vehicle_id")`,
    );

    await queryRunner.query(`DROP INDEX "core"."IDX_VEHICLE_RECORD_VEHICLE_MASTER_ID"`);
    await queryRunner.query(`DROP INDEX "core"."IDX_VEHICLE_RECORD_CHASSIS_NO"`);
    await queryRunner.query(`DROP INDEX "core"."IDX_VEHICLE_RECORD_PLATE_NUMBER"`);
    await queryRunner.query(`DROP INDEX "core"."IDX_VEHICLE_RECORD_VEHICLE_RECORD_ID"`);
    await queryRunner.query(`DROP TABLE "core"."vehicle_records"`);
  }
}
