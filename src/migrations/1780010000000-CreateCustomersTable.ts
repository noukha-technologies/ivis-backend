import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCustomersTable1780010000000 implements MigrationInterface {
  name = 'CreateCustomersTable1780010000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "core"`);

    await queryRunner.query(`
      CREATE TABLE "core"."customers" (
        "id"                  bigint              NOT NULL,
        "customer_id"         integer             NOT NULL,
        "name"                character varying(128) NOT NULL,
        "phone"               character varying(32)  NOT NULL,
        "owner_name"          character varying(128),
        "id_number"           character varying(64),
        "primary_vehicle_id"  bigint,
        "created_by"          character varying,
        "created_at"          TIMESTAMP           NOT NULL DEFAULT NOW(),
        "updated_at"          TIMESTAMP           NOT NULL DEFAULT NOW(),
        "is_deleted"          boolean             NOT NULL DEFAULT false,
        CONSTRAINT "PK_customers_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_customers_customer_id" UNIQUE ("customer_id"),
        CONSTRAINT "FK_customers_primary_vehicle_id"
          FOREIGN KEY ("primary_vehicle_id")
          REFERENCES "master"."vehicles"("id")
          ON DELETE SET NULL
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_CUSTOMER_CUSTOMER_ID" ON "core"."customers" ("customer_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_CUSTOMER_PHONE" ON "core"."customers" ("phone")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_CUSTOMER_ID_NUMBER" ON "core"."customers" ("id_number")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_CUSTOMER_PRIMARY_VEHICLE_ID" ON "core"."customers" ("primary_vehicle_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "core"."IDX_CUSTOMER_PRIMARY_VEHICLE_ID"`);
    await queryRunner.query(`DROP INDEX "core"."IDX_CUSTOMER_ID_NUMBER"`);
    await queryRunner.query(`DROP INDEX "core"."IDX_CUSTOMER_PHONE"`);
    await queryRunner.query(`DROP INDEX "core"."IDX_CUSTOMER_CUSTOMER_ID"`);
    await queryRunner.query(`DROP TABLE "core"."customers"`);
  }
}
