import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the `master.charge_categories` master table and links it to
 * `master.charges` via a nullable `charge_category_id` foreign key.
 *
 * Run with:  npm run migration:add-charge-categories
 *
 * Idempotent:
 *  - Table / columns created with IF NOT EXISTS
 *  - Indexes created with IF NOT EXISTS
 *  - Constraints dropped with IF EXISTS before being (re)added
 *
 * The legacy `charges.category` free-text column is relaxed to nullable so the
 * charge_category_id FK becomes the source of truth without breaking old rows.
 */
export class AddChargeCategories1782030000000 implements MigrationInterface {
  name = 'AddChargeCategories1782030000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // charge_categories: create table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "master"."charge_categories" (
        "id"               bigint                  NOT NULL,
        "category_id"      integer                 NOT NULL,
        "vehicle_weight"   character varying(128)  NOT NULL,
        "engine_capacity"  character varying(128)  NOT NULL,
        "fees"             numeric(12,3)           NOT NULL DEFAULT 0,
        "status"           character varying       NOT NULL DEFAULT 'Active',
        "created_by"       character varying,
        "created_at"       TIMESTAMP               NOT NULL DEFAULT NOW(),
        "updated_at"       TIMESTAMP               NOT NULL DEFAULT NOW(),
        "is_deleted"       boolean                 NOT NULL DEFAULT false,
        CONSTRAINT "PK_charge_categories_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_charge_categories_category_id" UNIQUE ("category_id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_CC_CATEGORY_ID" ON "master"."charge_categories" ("category_id")`,
    );

    // charges: add charge_category_id FK column
    await queryRunner.query(
      `ALTER TABLE "master"."charges" ADD COLUMN IF NOT EXISTS "charge_category_id" bigint`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_CHARGE_CATEGORY_ID" ON "master"."charges" ("charge_category_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."charges" DROP CONSTRAINT IF EXISTS "FK_charges_charge_category_id"`,
    );
    await queryRunner.query(`
      ALTER TABLE "master"."charges"
      ADD CONSTRAINT "FK_charges_charge_category_id"
      FOREIGN KEY ("charge_category_id") REFERENCES "master"."charge_categories"("id") ON DELETE NO ACTION
    `);

    // charges: relax legacy category column to nullable
    await queryRunner.query(
      `ALTER TABLE "master"."charges" ALTER COLUMN "category" DROP NOT NULL`,
    );

    // Replace the old uniqueness combo (centre/vehicle/category) with the FK-based combo
    await queryRunner.query(`DROP INDEX IF EXISTS "master"."IDX_CHARGE_UNIQUE_COMBO"`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_CHARGE_UNIQUE_COMBO"
        ON "master"."charges" ("centre_id", "vehicle_id", "charge_category_id")
        WHERE "is_deleted" = false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "master"."IDX_CHARGE_UNIQUE_COMBO"`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_CHARGE_UNIQUE_COMBO"
        ON "master"."charges" ("centre_id", "vehicle_id", "category")
        WHERE "is_deleted" = false
    `);
    await queryRunner.query(
      `ALTER TABLE "master"."charges" DROP CONSTRAINT IF EXISTS "FK_charges_charge_category_id"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "master"."IDX_CHARGE_CATEGORY_ID"`);
    await queryRunner.query(
      `ALTER TABLE "master"."charges" DROP COLUMN IF EXISTS "charge_category_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "master"."charge_categories"`);
  }
}
