import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Standalone ALTER migration — apply all structural changes to an existing database.
 *
 * Run with:  npm run migration:alter
 *
 * Guards on RUN_ALTER_SCHEMA=true so it is never executed by accident during
 * a normal `migration:run`.
 *
 * Each ALTER block is idempotent:
 *  - Columns are added with ADD COLUMN IF NOT EXISTS
 *  - Indexes are created with CREATE INDEX IF NOT EXISTS
 *  - Constraints are dropped with DROP CONSTRAINT IF EXISTS before re-adding
 *
 * This migration reflects every structural change that was applied incrementally
 * across the 42 prior migrations, expressed as a single idempotent ALTER pass.
 * Run it against a database that was created by CreateSchema (1782000000000) to
 * verify it is a no-op, or against a partially-migrated older database to bring
 * it to the current state.
 *
 * The down() method reverts ALL structural changes in reverse order.
 */
export class AlterSchema1782010000000 implements MigrationInterface {
  name = 'AlterSchema1782010000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (process.env.RUN_ALTER_SCHEMA !== 'true') {
      console.warn(
        '[AlterSchema] Skipped: set RUN_ALTER_SCHEMA=true or use npm run migration:alter',
      );
      return;
    }

    console.log('[AlterSchema] Applying structural alterations...');

    await this.alterCore(queryRunner);
    await this.alterMaster(queryRunner);
    await this.alterTransaction(queryRunner);
    await this.reconcileForeignKeys(queryRunner);
    await this.alignPaymentsAndAnprEvents(queryRunner);

    console.log('[AlterSchema] Done.');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (process.env.RUN_ALTER_SCHEMA !== 'true') {
      console.warn('[AlterSchema] down() skipped: RUN_ALTER_SCHEMA not set.');
      return;
    }

    console.log('[AlterSchema] Reverting structural alterations...');

    await this.revertPaymentsAndAnprEvents(queryRunner);
    await this.revertForeignKeys(queryRunner);
    await this.revertTransaction(queryRunner);
    await this.revertMaster(queryRunner);
    await this.revertCore(queryRunner);

    console.log('[AlterSchema] Revert done.');
  }

  // ─── core schema alterations ──────────────────────────────────────────────────

  private async alterCore(queryRunner: QueryRunner): Promise<void> {
    // users: add password (migration 1779369290262)
    await queryRunner.query(
      `ALTER TABLE "core"."users" ADD COLUMN IF NOT EXISTS "password" character varying`,
    );

    // users: add created_by (migration 1779720300000)
    await queryRunner.query(
      `ALTER TABLE "core"."users" ADD COLUMN IF NOT EXISTS "created_by" character varying`,
    );

    // users: replace text center/line columns with FK bigint columns (migration 1780000000000)
    await queryRunner.query(`ALTER TABLE "core"."users" DROP COLUMN IF EXISTS "center"`);
    await queryRunner.query(`ALTER TABLE "core"."users" DROP COLUMN IF EXISTS "line"`);
    await queryRunner.query(
      `ALTER TABLE "core"."users" ADD COLUMN IF NOT EXISTS "center_id" bigint`,
    );

    // users: drop legacy role_id (string FK to master.roles) — migration 1780080000000 / 1780140000000
    await queryRunner.query(
      `ALTER TABLE "core"."users" DROP CONSTRAINT IF EXISTS "FK_users_role"`,
    );
    await queryRunner.query(
      `ALTER TABLE "core"."users" DROP CONSTRAINT IF EXISTS "FK_users_role_id"`,
    );
    // users: drop intermediate role_access columns — migration 1780080000000–1780140000000
    await queryRunner.query(
      `ALTER TABLE "core"."users" DROP CONSTRAINT IF EXISTS "FK_users_role_access_id"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "core"."IDX_USER_ROLE_ACCESS_ID"`);
    await queryRunner.query(
      `ALTER TABLE "core"."users" DROP COLUMN IF EXISTS "role_access_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "core"."users" DROP COLUMN IF EXISTS "role_name"`,
    );

    // users: final role_id bigint FK column pointing at core.roles (migration 1780140000000)
    await queryRunner.query(
      `ALTER TABLE "core"."users" ADD COLUMN IF NOT EXISTS "role_id" bigint`,
    );
    await queryRunner.query(`
      UPDATE "core"."users"
      SET "role_id" = (SELECT "id" FROM "core"."roles" WHERE "is_deleted" = false ORDER BY "role_id" ASC LIMIT 1)
      WHERE "role_id" IS NULL
        AND EXISTS (SELECT 1 FROM "core"."roles" WHERE "is_deleted" = false)
    `);
    await queryRunner.query(
      `ALTER TABLE "core"."users" ALTER COLUMN "role_id" SET NOT NULL`,
    );

    // users: add user_code column (migration 1780110000000)
    await queryRunner.query(
      `ALTER TABLE "core"."users" ADD COLUMN IF NOT EXISTS "user_code" character varying`,
    );
    await queryRunner.query(`
      UPDATE "core"."users"
      SET "user_code" = 'USR' || LPAD("user_id"::text, 4, '0')
      WHERE "user_code" IS NULL OR TRIM("user_code") = ''
    `);
    await queryRunner.query(
      `ALTER TABLE "core"."users" ALTER COLUMN "user_code" SET NOT NULL`,
    );

    // users: indexes
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_USER_USER_CODE" ON "core"."users" ("user_code")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_USER_ROLE_ID" ON "core"."users" ("role_id")`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_USER_CENTER_ID" ON "core"."users" ("center_id")
      WHERE "is_deleted" = false AND "center_id" IS NOT NULL
    `);

    // user_sessions: add created_by (migration 1779720300000)
    await queryRunner.query(
      `ALTER TABLE "core"."user_sessions" ADD COLUMN IF NOT EXISTS "created_by" character varying`,
    );

    // user_line_mappings table (migration 1780100000000) — created here if absent
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "core"."user_line_mappings" (
        "id"          bigint    NOT NULL,
        "user_id"     bigint    NOT NULL,
        "line_id"     bigint    NOT NULL,
        "created_by"  character varying,
        "created_at"  TIMESTAMP NOT NULL DEFAULT NOW(),
        "updated_at"  TIMESTAMP NOT NULL DEFAULT NOW(),
        "is_deleted"  boolean   NOT NULL DEFAULT false,
        CONSTRAINT "PK_user_line_mappings_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_USER_LINE_MAPPING_USER_ID" ON "core"."user_line_mappings" ("user_id")`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_USER_LINE_MAPPING_USER_LINE"
      ON "core"."user_line_mappings" ("user_id", "line_id")
      WHERE "is_deleted" = false
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_USER_LINE_MAPPING_LINE"
      ON "core"."user_line_mappings" ("line_id")
      WHERE "is_deleted" = false
    `);

    // permissions table (migration 1780140000000) — recreated with new shape
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "core"."permissions" (
        "id"          bigint                  NOT NULL,
        "name"        character varying(128)  NOT NULL,
        "access"      jsonb                   NOT NULL DEFAULT '{}'::jsonb,
        "is_active"   boolean                 NOT NULL DEFAULT true,
        "created_by"  character varying,
        "created_at"  TIMESTAMP               NOT NULL DEFAULT NOW(),
        "updated_at"  TIMESTAMP               NOT NULL DEFAULT NOW(),
        "is_deleted"  boolean                 NOT NULL DEFAULT false,
        CONSTRAINT "PK_permissions_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_permissions_name" UNIQUE ("name")
      )
    `);
    // drop old key column if present from the first permissions shape
    await queryRunner.query(
      `ALTER TABLE "core"."permissions" DROP COLUMN IF EXISTS "key"`,
    );
    await queryRunner.query(
      `ALTER TABLE "core"."permissions" DROP COLUMN IF EXISTS "description"`,
    );
    await queryRunner.query(
      `ALTER TABLE "core"."permissions" ADD COLUMN IF NOT EXISTS "name" character varying(128)`,
    );
    await queryRunner.query(
      `ALTER TABLE "core"."permissions" ADD COLUMN IF NOT EXISTS "access" jsonb NOT NULL DEFAULT '{}'::jsonb`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_PERMISSION_PROFILE_NAME" ON "core"."permissions" ("name")`,
    );

    // roles table (migration 1780140000000)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "core"."roles" (
        "id"            bigint                  NOT NULL,
        "role_id"       integer                 NOT NULL,
        "role_name"     character varying(64)   NOT NULL,
        "permission_id" bigint                  NOT NULL,
        "description"   character varying(512),
        "created_by"    character varying,
        "created_at"    TIMESTAMP               NOT NULL DEFAULT NOW(),
        "updated_at"    TIMESTAMP               NOT NULL DEFAULT NOW(),
        "is_deleted"    boolean                 NOT NULL DEFAULT false,
        CONSTRAINT "PK_roles_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_roles_role_id" UNIQUE ("role_id"),
        CONSTRAINT "UQ_roles_role_name" UNIQUE ("role_name"),
        CONSTRAINT "UQ_roles_permission_id" UNIQUE ("permission_id")
      )
    `);
    // drop obsolete is_system column (migration Initalization1781350183656)
    await queryRunner.query(
      `ALTER TABLE "core"."roles" DROP COLUMN IF EXISTS "is_system"`,
    );
    // wire roles_role_id_seq if not already present (migration 1780160000000)
    await queryRunner.query(
      `CREATE SEQUENCE IF NOT EXISTS "core"."roles_role_id_seq" OWNED BY "core"."roles"."role_id"`,
    );
    await queryRunner.query(`
      SELECT setval(
        '"core"."roles_role_id_seq"',
        COALESCE((SELECT MAX("role_id") FROM "core"."roles"), 0) + 1,
        false
      )
    `);
    await queryRunner.query(
      `ALTER TABLE "core"."roles" ALTER COLUMN "role_id" SET DEFAULT nextval('"core"."roles_role_id_seq"')`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_ROLE_ROLE_NAME" ON "core"."roles" ("role_name")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_ROLE_PERMISSION_ID" ON "core"."roles" ("permission_id")`,
    );
  }

  // ─── master schema alterations ────────────────────────────────────────────────

  private async alterMaster(queryRunner: QueryRunner): Promise<void> {
    // vehicles: ensure table exists (may be missing on DBs bootstrapped via legacy migrations only)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "master"."vehicles" (
        "id"          bigint                  NOT NULL,
        "vehicle_id"  integer                 NOT NULL,
        "name"        character varying(128)  NOT NULL,
        "code"        character varying(64)   NOT NULL,
        "vin_no"      character varying(64),
        "description" character varying(512),
        "status"      character varying(32)   NOT NULL DEFAULT 'Active',
        "created_by"  character varying,
        "created_at"  TIMESTAMP               NOT NULL DEFAULT NOW(),
        "updated_at"  TIMESTAMP               NOT NULL DEFAULT NOW(),
        "is_deleted"  boolean                 NOT NULL DEFAULT false,
        CONSTRAINT "PK_vehicles_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_vehicles_vehicle_id" UNIQUE ("vehicle_id"),
        CONSTRAINT "UQ_vehicles_code" UNIQUE ("code")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_VEHICLE_VEHICLE_ID" ON "master"."vehicles" ("vehicle_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_VEHICLE_CODE" ON "master"."vehicles" ("code")`,
    );

    // vehicles: replace plate/type/color/brand with name/code/vin_no/status (migration 1780020000000)
    await queryRunner.query(
      `ALTER TABLE "master"."vehicles" DROP COLUMN IF EXISTS "plate_number"`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."vehicles" DROP COLUMN IF EXISTS "vehicle_type"`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."vehicles" DROP COLUMN IF EXISTS "vehicle_color"`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."vehicles" DROP COLUMN IF EXISTS "vehicle_brand"`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."vehicles" ADD COLUMN IF NOT EXISTS "name" character varying(128)`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."vehicles" ADD COLUMN IF NOT EXISTS "code" character varying(64)`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."vehicles" ADD COLUMN IF NOT EXISTS "vin_no" character varying(64)`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."vehicles" ADD COLUMN IF NOT EXISTS "status" character varying(32) NOT NULL DEFAULT 'Active'`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."vehicles" DROP CONSTRAINT IF EXISTS "UQ_vehicle_code"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_VEHICLE_CODE" ON "master"."vehicles" ("code")`,
    );

    // vehicles: add created_by (migration 1779720300000)
    await queryRunner.query(
      `ALTER TABLE "master"."vehicles" ADD COLUMN IF NOT EXISTS "created_by" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."vehicles" ADD COLUMN IF NOT EXISTS "description" character varying(512)`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_VEHICLE_VIN_NO"
        ON "master"."vehicles" ("vin_no")
        WHERE "is_deleted" = false AND "vin_no" IS NOT NULL
    `);

    // lines: add centre_id FK (migration 1780120000000)
    await queryRunner.query(
      `ALTER TABLE "master"."lines" ADD COLUMN IF NOT EXISTS "centre_id" bigint`,
    );
    await queryRunner.query(`
      UPDATE "master"."lines" l
      SET "centre_id" = (
        SELECT c.id FROM "master"."centres" c WHERE c.is_deleted = false ORDER BY c.centre_id ASC LIMIT 1
      )
      WHERE l."centre_id" IS NULL
        AND EXISTS (SELECT 1 FROM "master"."centres" WHERE is_deleted = false)
    `);
    await queryRunner.query(
      `ALTER TABLE "master"."lines" ALTER COLUMN "centre_id" SET NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_LINE_CENTRE_ID" ON "master"."lines" ("centre_id")`,
    );

    // admin_pcs: drop legacy line_id column and add centre_id (migration 1780120000000),
    // then drop centre_id and restore line_id via admin_pc_line_mappings (1780170000000 / 1781174000000)
    await queryRunner.query(
      `ALTER TABLE "master"."admin_pcs" DROP CONSTRAINT IF EXISTS "FK_admin_pcs_line_id"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "master"."UQ_admin_pcs_line_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "master"."UQ_ADMIN_PC_LINE_ID"`);
    await queryRunner.query(
      `ALTER TABLE "master"."admin_pcs" DROP COLUMN IF EXISTS "line_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."admin_pcs" DROP CONSTRAINT IF EXISTS "FK_admin_pcs_centre_id"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "master"."IDX_ADMIN_PC_CENTRE_ID"`);
    await queryRunner.query(
      `ALTER TABLE "master"."admin_pcs" DROP COLUMN IF EXISTS "centre_id"`,
    );

    // cameras: drop unique constraint added by Initalization and keep partial unique index
    await queryRunner.query(
      `ALTER TABLE "master"."cameras" DROP CONSTRAINT IF EXISTS "UQ_b3a5f72708eb14f0b044646653b"`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_CAMERA_LINE_ID" ON "master"."cameras" ("line_id")
      WHERE "is_deleted" = false
    `);

    // cameras: drop legacy columns no longer on entity
    await queryRunner.query(
      `ALTER TABLE "master"."cameras" DROP COLUMN IF EXISTS "type"`,
    );

    // cameras: add camera_name (replaces old "name" column if it ever existed)
    await queryRunner.query(
      `ALTER TABLE "master"."cameras" DROP COLUMN IF EXISTS "name"`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."cameras" ADD COLUMN IF NOT EXISTS "camera_name" character varying`,
    );
    await queryRunner.query(`
      UPDATE "master"."cameras"
      SET "camera_name" = 'Camera ' || "camera_id"::text
      WHERE "camera_name" IS NULL OR TRIM("camera_name") = ''
    `);
    await queryRunner.query(
      `ALTER TABLE "master"."cameras" ALTER COLUMN "camera_name" SET NOT NULL`,
    );

    // cameras: network config columns
    await queryRunner.query(
      `ALTER TABLE "master"."cameras" ADD COLUMN IF NOT EXISTS "ip_address" character varying`,
    );
    await queryRunner.query(
      `UPDATE "master"."cameras" SET "ip_address" = '0.0.0.0' WHERE "ip_address" IS NULL OR TRIM("ip_address") = ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."cameras" ALTER COLUMN "ip_address" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."cameras" ADD COLUMN IF NOT EXISTS "port" integer NOT NULL DEFAULT 80`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."cameras" ADD COLUMN IF NOT EXISTS "username" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."cameras" ADD COLUMN IF NOT EXISTS "password" character varying`,
    );

    // cameras: integration config columns
    await queryRunner.query(
      `ALTER TABLE "master"."cameras" ADD COLUMN IF NOT EXISTS "integration_method" character varying DEFAULT 'ftp'`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."cameras" ADD COLUMN IF NOT EXISTS "ftp_directory" character varying`,
    );

    // cameras: operational / health columns
    await queryRunner.query(
      `ALTER TABLE "master"."cameras" ADD COLUMN IF NOT EXISTS "is_online" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."cameras" ADD COLUMN IF NOT EXISTS "last_event_at" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."cameras" ADD COLUMN IF NOT EXISTS "last_health_check" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."cameras" ADD COLUMN IF NOT EXISTS "health_status" character varying NOT NULL DEFAULT 'NOT_REACHABLE'`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."cameras" ADD COLUMN IF NOT EXISTS "last_seen_at" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."cameras" ADD COLUMN IF NOT EXISTS "health_ping_interval_seconds" integer NOT NULL DEFAULT 30`,
    );

    // admin_pc_line_mappings table (migration 1781174000000)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "master"."admin_pc_line_mappings" (
        "id"          bigint    NOT NULL,
        "admin_pc_id" bigint    NOT NULL,
        "line_id"     bigint    NOT NULL,
        "created_by"  character varying,
        "created_at"  TIMESTAMP NOT NULL DEFAULT NOW(),
        "updated_at"  TIMESTAMP NOT NULL DEFAULT NOW(),
        "is_deleted"  boolean   NOT NULL DEFAULT false,
        CONSTRAINT "PK_admin_pc_line_mappings_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_admin_pc_line_mappings_admin_pc_id"
          FOREIGN KEY ("admin_pc_id") REFERENCES "master"."admin_pcs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "FK_admin_pc_line_mappings_line_id"
          FOREIGN KEY ("line_id") REFERENCES "master"."lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_ADMIN_PC_LINE_MAPPING_ADMIN_PC_ID" ON "master"."admin_pc_line_mappings" ("admin_pc_id")`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_ADMIN_PC_LINE_MAPPING_ADMIN_PC_LINE"
      ON "master"."admin_pc_line_mappings" ("admin_pc_id", "line_id")
      WHERE "is_deleted" = false
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_ADMIN_PC_LINE_MAPPING_LINE"
      ON "master"."admin_pc_line_mappings" ("line_id")
      WHERE "is_deleted" = false
    `);

    // payments: drop legacy name/customer_phone, add customer_id/payment_mode/type/amount
    // (migrations 1780190000000, 1781162440262, 1781166214357, 1781170000000–1781173000000)
    await queryRunner.query(
      `ALTER TABLE "master"."payments" DROP COLUMN IF EXISTS "name"`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."payments" DROP COLUMN IF EXISTS "customer_phone"`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."payments" ADD COLUMN IF NOT EXISTS "customer_id" bigint`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."payments" ADD COLUMN IF NOT EXISTS "payment_mode" character varying(64)`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."payments" ADD COLUMN IF NOT EXISTS "type" character varying(64)`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."payments" ADD COLUMN IF NOT EXISTS "amount" numeric(12,2)`,
    );
    await queryRunner.query(
      `UPDATE "master"."payments" SET "amount" = 0 WHERE "amount" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."payments" ALTER COLUMN "amount" SET DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."payments" ALTER COLUMN "amount" SET NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_PAYMENT_CUSTOMER_ID" ON "master"."payments" ("customer_id")`,
    );

    // charges: create table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "master"."charges" (
        "id"              bigint              NOT NULL,
        "charge_id"       integer             NOT NULL,
        "centre_id"       bigint,
        "vehicle_id"      bigint              NOT NULL,
        "category"        character varying   NOT NULL,
        "center_charges"  numeric(12,3)       NOT NULL DEFAULT 0,
        "rop_charges"     numeric(12,3)       NOT NULL DEFAULT 0,
        "vat_percent"     numeric(5,2)        NOT NULL DEFAULT 0,
        "grand_total"     numeric(12,3)       NOT NULL DEFAULT 0,
        "validate_to"     date                NOT NULL,
        "status"          character varying   NOT NULL DEFAULT 'Active',
        "is_enabled"      boolean             NOT NULL DEFAULT true,
        "created_by"      character varying,
        "created_at"      TIMESTAMP           NOT NULL DEFAULT NOW(),
        "updated_at"      TIMESTAMP           NOT NULL DEFAULT NOW(),
        "is_deleted"      boolean             NOT NULL DEFAULT false,
        CONSTRAINT "PK_charges_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_charges_charge_id" UNIQUE ("charge_id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_CHARGE_CHARGE_ID" ON "master"."charges" ("charge_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_CHARGE_CENTRE_ID" ON "master"."charges" ("centre_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_CHARGE_VEHICLE_ID" ON "master"."charges" ("vehicle_id")`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_CHARGE_UNIQUE_COMBO"
        ON "master"."charges" ("centre_id", "vehicle_id", "category")
        WHERE "is_deleted" = false
    `);

    // payment_types: create table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "master"."payment_types" (
        "id"               bigint                  NOT NULL,
        "payment_type_id"  integer                 NOT NULL,
        "name"             character varying(128)  NOT NULL,
        "code"             character varying(64)   NOT NULL,
        "status"           character varying       NOT NULL DEFAULT 'Active',
        "created_by"       character varying,
        "created_at"       TIMESTAMP               NOT NULL DEFAULT NOW(),
        "updated_at"       TIMESTAMP               NOT NULL DEFAULT NOW(),
        "is_deleted"       boolean                 NOT NULL DEFAULT false,
        CONSTRAINT "PK_payment_types_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_payment_types_payment_type_id" UNIQUE ("payment_type_id"),
        CONSTRAINT "UQ_payment_types_code" UNIQUE ("code")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_PT_PAYMENT_TYPE_ID" ON "master"."payment_types" ("payment_type_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_PT_CODE" ON "master"."payment_types" ("code")`,
    );

    // charge_categories: create table (FK target for charges.charge_category_id)
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

    // charges: link to charge_categories master, relax legacy free-text category
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
    await queryRunner.query(
      `ALTER TABLE "master"."charges" ALTER COLUMN "category" DROP NOT NULL`,
    );
    // Replace the old (centre/vehicle/category) combo with the FK-based combo
    await queryRunner.query(`DROP INDEX IF EXISTS "master"."IDX_CHARGE_UNIQUE_COMBO"`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_CHARGE_UNIQUE_COMBO"
        ON "master"."charges" ("centre_id", "vehicle_id", "charge_category_id")
        WHERE "is_deleted" = false
    `);
  }

  // ─── transaction schema alterations ──────────────────────────────────────────

  private async alterTransaction(queryRunner: QueryRunner): Promise<void> {
    // customers: add chassis_no + mulkiya_id (migration 1781171000000)
    await queryRunner.query(
      `ALTER TABLE "transaction"."customers" ADD COLUMN IF NOT EXISTS "chassis_no" character varying(64)`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction"."customers" ADD COLUMN IF NOT EXISTS "mulkiya_id" character varying(64)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_CUSTOMER_CHASSIS_NO" ON "transaction"."customers" ("chassis_no")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_CUSTOMER_MULKIYA_ID" ON "transaction"."customers" ("mulkiya_id")`,
    );

    // appointments: type column is nullable per the entity — a queued ANPR
    // appointment is created before any payment, so it must allow NULL.
    await queryRunner.query(
      `ALTER TABLE "transaction"."appointments" ADD COLUMN IF NOT EXISTS "type" character varying(64)`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction"."appointments" ALTER COLUMN "type" DROP NOT NULL`,
    );
    // appointments: payment mode now references the payment_types master (FK),
    // replacing the legacy free-text payment_mode column.
    await queryRunner.query(
      `ALTER TABLE "transaction"."appointments" ADD COLUMN IF NOT EXISTS "payment_type_id" bigint`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_APPOINTMENT_PAYMENT_TYPE_ID" ON "transaction"."appointments" ("payment_type_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction"."appointments" DROP CONSTRAINT IF EXISTS "FK_appointments_payment_type_id"`,
    );
    await queryRunner.query(`
      ALTER TABLE "transaction"."appointments"
      ADD CONSTRAINT "FK_appointments_payment_type_id"
      FOREIGN KEY ("payment_type_id") REFERENCES "master"."payment_types"("id") ON DELETE NO ACTION
    `);
    await queryRunner.query(
      `ALTER TABLE "transaction"."appointments" DROP COLUMN IF EXISTS "payment_mode"`,
    );

    // anpr_captures: line_id is a bigint FK to master.lines (replaces the legacy
    // free-text varchar column). Free-text values cannot cast to bigint, so the
    // legacy column is dropped when present before re-adding it as bigint.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'transaction' AND table_name = 'anpr_captures'
            AND column_name = 'line_id' AND udt_name <> 'int8'
        ) THEN
          EXECUTE 'ALTER TABLE "transaction"."anpr_captures" DROP CONSTRAINT IF EXISTS "FK_anpr_captures_line_id"';
          EXECUTE 'ALTER TABLE "transaction"."anpr_captures" DROP COLUMN "line_id"';
        END IF;
      END $$;
    `);
    await queryRunner.query(
      `ALTER TABLE "transaction"."anpr_captures" ADD COLUMN IF NOT EXISTS "line_id" bigint`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction"."anpr_captures" DROP CONSTRAINT IF EXISTS "FK_anpr_captures_line_id"`,
    );
    await queryRunner.query(`
      ALTER TABLE "transaction"."anpr_captures"
      ADD CONSTRAINT "FK_anpr_captures_line_id"
      FOREIGN KEY ("line_id") REFERENCES "master"."lines"("id") ON DELETE NO ACTION
    `);
    await queryRunner.query(
      `ALTER TABLE "transaction"."anpr_captures" DROP COLUMN IF EXISTS "lane"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction"."anpr_captures" DROP COLUMN IF EXISTS "country_code"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction"."anpr_captures" DROP COLUMN IF EXISTS "verification_status"`,
    );
    // anpr_captures: persisted lifecycle status — stays 'Pending' until validated.
    await queryRunner.query(
      `ALTER TABLE "transaction"."anpr_captures" ADD COLUMN IF NOT EXISTS "status" character varying(32) NOT NULL DEFAULT 'Pending'`,
    );
    // anpr_captures: extra ANPR camera attributes (entity-aligned).
    await queryRunner.query(
      `ALTER TABLE "transaction"."anpr_captures" ADD COLUMN IF NOT EXISTS "vehicle_brand" character varying(64)`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction"."anpr_captures" ADD COLUMN IF NOT EXISTS "plate_size" character varying(32)`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction"."anpr_captures" ADD COLUMN IF NOT EXISTS "plate_type" character varying(32)`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction"."anpr_captures" ADD COLUMN IF NOT EXISTS "category" character varying(32)`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction"."anpr_captures" ADD COLUMN IF NOT EXISTS "scene_image_url" character varying`,
    );

    // customers: align columns with entity — rename name → customer_name and
    // primary_vehicle_record_id → vehicle_record_id, add alternate_phone +
    // owner_phone_number, and rename the related index / FK constraint.
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'transaction' AND table_name = 'customers' AND column_name = 'name'
        ) THEN
          ALTER TABLE "transaction"."customers" RENAME COLUMN "name" TO "customer_name";
        END IF;
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'transaction' AND table_name = 'customers' AND column_name = 'primary_vehicle_record_id'
        ) THEN
          ALTER TABLE "transaction"."customers" RENAME COLUMN "primary_vehicle_record_id" TO "vehicle_record_id";
        END IF;
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_customers_primary_vehicle_record_id') THEN
          ALTER TABLE "transaction"."customers"
            RENAME CONSTRAINT "FK_customers_primary_vehicle_record_id" TO "FK_customers_vehicle_record_id";
        END IF;
      END $$;
    `);
    await queryRunner.query(
      `ALTER TABLE "transaction"."customers" ADD COLUMN IF NOT EXISTS "alternate_phone" character varying(32)`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction"."customers" ADD COLUMN IF NOT EXISTS "owner_phone_number" character varying(32)`,
    );
    await queryRunner.query(
      `ALTER INDEX IF EXISTS "transaction"."IDX_CUSTOMER_PRIMARY_VEHICLE_RECORD_ID" RENAME TO "IDX_CUSTOMER_VEHICLE_RECORD_ID"`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_CUSTOMER_VEHICLE_RECORD_ID" ON "transaction"."customers" ("vehicle_record_id")`,
    );
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_customers_vehicle_record_id') THEN
          ALTER TABLE "transaction"."customers"
            ADD CONSTRAINT "FK_customers_vehicle_record_id"
            FOREIGN KEY ("vehicle_record_id") REFERENCES "transaction"."vehicle_records"("id") ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    // anpr_captures / rop_verifications / jobs / payment_transactions indexes
    // (idempotent — only created if absent)
    // line_id-based indexes replace the legacy camera_id-based ones (entity-aligned).
    await queryRunner.query(`DROP INDEX IF EXISTS "transaction"."UQ_ANPR_CAPTURE_CAMERA_PLATE_TIME"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "transaction"."IDX_ANPR_CAPTURE_CAMERA_TIME"`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_ANPR_CAPTURE_LINE_PLATE_TIME"
      ON "transaction"."anpr_captures" ("line_id", "plate_number", "capture_time")
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_ANPR_CAPTURE_LINE_TIME" ON "transaction"."anpr_captures" ("line_id", "capture_time")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_ROP_VERIFICATION_FETCH_STATUS_CREATED_AT" ON "transaction"."rop_verifications" ("fetch_status", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_ROP_VERIFICATION_ANPR_CAPTURE_ID" ON "transaction"."rop_verifications" ("anpr_capture_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_APPOINTMENT_ANPR_CAPTURE_ID" ON "transaction"."appointments" ("anpr_capture_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_APPOINTMENT_CUSTOMER_ID" ON "transaction"."appointments" ("customer_id")`,
    );
    // The legacy "payment_transactions" table was replaced by "transaction"."payments"
    // (see AlignPaymentsTable migration). Only index it if it still exists on this DB.
    const [{ paymentTxnTable }] = await queryRunner.query(
      `SELECT to_regclass('transaction.payment_transactions') AS "paymentTxnTable"`,
    );
    if (paymentTxnTable) {
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "IDX_PAYMENT_TRANSACTION_CUSTOMER_ID" ON "transaction"."payment_transactions" ("customer_id")`,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "IDX_PAYMENT_TRANSACTION_STATUS" ON "transaction"."payment_transactions" ("status")`,
      );
    }
  }

  // ─── Reconcile cross-schema foreign keys ─────────────────────────────────────

  private async reconcileForeignKeys(queryRunner: QueryRunner): Promise<void> {
    // Drop any stale constraint names first, then re-add canonical versions

    // core.roles → core.permissions
    await queryRunner.query(
      `ALTER TABLE "core"."roles" DROP CONSTRAINT IF EXISTS "FK_roles_permission_id"`,
    );
    await queryRunner.query(`
      ALTER TABLE "core"."roles"
      ADD CONSTRAINT "FK_roles_permission_id"
        FOREIGN KEY ("permission_id") REFERENCES "core"."permissions"("id") ON DELETE NO ACTION
    `);

    // core.users → core.roles
    await queryRunner.query(
      `ALTER TABLE "core"."users" DROP CONSTRAINT IF EXISTS "FK_users_role_id"`,
    );
    await queryRunner.query(`
      ALTER TABLE "core"."users"
      ADD CONSTRAINT "FK_users_role_id"
        FOREIGN KEY ("role_id") REFERENCES "core"."roles"("id") ON DELETE NO ACTION
    `);

    // core.users → master.centres
    await queryRunner.query(
      `ALTER TABLE "core"."users" DROP CONSTRAINT IF EXISTS "FK_users_center_id"`,
    );
    await queryRunner.query(`
      ALTER TABLE "core"."users"
      ADD CONSTRAINT "FK_users_center_id"
        FOREIGN KEY ("center_id") REFERENCES "master"."centres"("id") ON DELETE NO ACTION
    `);

    // core.user_line_mappings → core.users + master.lines
    await queryRunner.query(
      `ALTER TABLE "core"."user_line_mappings" DROP CONSTRAINT IF EXISTS "FK_user_line_mappings_user_id"`,
    );
    await queryRunner.query(`
      ALTER TABLE "core"."user_line_mappings"
      ADD CONSTRAINT "FK_user_line_mappings_user_id"
        FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE
    `);
    await queryRunner.query(
      `ALTER TABLE "core"."user_line_mappings" DROP CONSTRAINT IF EXISTS "FK_user_line_mappings_line_id"`,
    );
    await queryRunner.query(`
      ALTER TABLE "core"."user_line_mappings"
      ADD CONSTRAINT "FK_user_line_mappings_line_id"
        FOREIGN KEY ("line_id") REFERENCES "master"."lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE
    `);

    // master.lines → master.centres
    await queryRunner.query(
      `ALTER TABLE "master"."lines" DROP CONSTRAINT IF EXISTS "FK_lines_centre_id"`,
    );
    await queryRunner.query(`
      ALTER TABLE "master"."lines"
      ADD CONSTRAINT "FK_lines_centre_id"
        FOREIGN KEY ("centre_id") REFERENCES "master"."centres"("id") ON DELETE RESTRICT
    `);

    // master.payments → transaction.customers
    await queryRunner.query(
      `ALTER TABLE "master"."payments" DROP CONSTRAINT IF EXISTS "FK_payments_customer_id"`,
    );
    await queryRunner.query(`
      ALTER TABLE "master"."payments"
      ADD CONSTRAINT "FK_payments_customer_id"
        FOREIGN KEY ("customer_id") REFERENCES "transaction"."customers"("id") ON DELETE NO ACTION
    `);

    // master.charges → master.centres (nullable FK)
    await queryRunner.query(
      `ALTER TABLE "master"."charges" DROP CONSTRAINT IF EXISTS "FK_charges_centre_id"`,
    );
    await queryRunner.query(`
      ALTER TABLE "master"."charges"
      ADD CONSTRAINT "FK_charges_centre_id"
        FOREIGN KEY ("centre_id") REFERENCES "master"."centres"("id") ON DELETE RESTRICT
    `);

    // master.charges → master.vehicles
    await queryRunner.query(
      `ALTER TABLE "master"."charges" DROP CONSTRAINT IF EXISTS "FK_charges_vehicle_id"`,
    );
    await queryRunner.query(`
      ALTER TABLE "master"."charges"
      ADD CONSTRAINT "FK_charges_vehicle_id"
        FOREIGN KEY ("vehicle_id") REFERENCES "master"."vehicles"("id") ON DELETE RESTRICT
    `);
  }

  // ─── Revert helpers ───────────────────────────────────────────────────────────

  private async revertForeignKeys(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "master"."charges" DROP CONSTRAINT IF EXISTS "FK_charges_vehicle_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."charges" DROP CONSTRAINT IF EXISTS "FK_charges_centre_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."payments" DROP CONSTRAINT IF EXISTS "FK_payments_customer_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."lines" DROP CONSTRAINT IF EXISTS "FK_lines_centre_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "core"."user_line_mappings" DROP CONSTRAINT IF EXISTS "FK_user_line_mappings_line_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "core"."user_line_mappings" DROP CONSTRAINT IF EXISTS "FK_user_line_mappings_user_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "core"."users" DROP CONSTRAINT IF EXISTS "FK_users_center_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "core"."users" DROP CONSTRAINT IF EXISTS "FK_users_role_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "core"."roles" DROP CONSTRAINT IF EXISTS "FK_roles_permission_id"`,
    );
  }

  private async revertTransaction(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "transaction"."IDX_PAYMENT_TRANSACTION_STATUS"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "transaction"."IDX_PAYMENT_TRANSACTION_CUSTOMER_ID"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "transaction"."IDX_APPOINTMENT_CUSTOMER_ID"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "transaction"."IDX_APPOINTMENT_ANPR_CAPTURE_ID"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "transaction"."IDX_ROP_VERIFICATION_ANPR_CAPTURE_ID"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "transaction"."IDX_ROP_VERIFICATION_FETCH_STATUS_CREATED_AT"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction"."anpr_captures" DROP CONSTRAINT IF EXISTS "FK_anpr_captures_line_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "transaction"."IDX_ANPR_CAPTURE_LINE_TIME"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "transaction"."UQ_ANPR_CAPTURE_LINE_PLATE_TIME"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction"."anpr_captures" DROP COLUMN IF EXISTS "status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction"."anpr_captures" DROP COLUMN IF EXISTS "vehicle_brand"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction"."anpr_captures" DROP COLUMN IF EXISTS "plate_size"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction"."anpr_captures" DROP COLUMN IF EXISTS "plate_type"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction"."anpr_captures" DROP COLUMN IF EXISTS "category"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction"."anpr_captures" DROP COLUMN IF EXISTS "scene_image_url"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction"."appointments" DROP CONSTRAINT IF EXISTS "FK_appointments_payment_type_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "transaction"."IDX_APPOINTMENT_PAYMENT_TYPE_ID"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction"."appointments" DROP COLUMN IF EXISTS "payment_type_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction"."appointments" DROP COLUMN IF EXISTS "type"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "transaction"."IDX_CUSTOMER_MULKIYA_ID"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "transaction"."IDX_CUSTOMER_CHASSIS_NO"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction"."customers" DROP COLUMN IF EXISTS "mulkiya_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction"."customers" DROP COLUMN IF EXISTS "chassis_no"`,
    );
  }

  private async revertMaster(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "master"."IDX_PT_CODE"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "master"."IDX_PT_PAYMENT_TYPE_ID"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "master"."payment_types"`);

    await queryRunner.query(
      `ALTER TABLE "master"."charges" DROP CONSTRAINT IF EXISTS "FK_charges_charge_category_id"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "master"."IDX_CHARGE_CATEGORY_ID"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "master"."IDX_CHARGE_UNIQUE_COMBO"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "master"."IDX_CHARGE_VEHICLE_ID"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "master"."IDX_CHARGE_CENTRE_ID"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "master"."IDX_CHARGE_CHARGE_ID"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "master"."charges"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "master"."IDX_CC_CATEGORY_ID"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "master"."charge_categories"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "master"."IDX_PAYMENT_CUSTOMER_ID"`);
    await queryRunner.query(
      `ALTER TABLE "master"."payments" ALTER COLUMN "amount" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."payments" ALTER COLUMN "amount" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."payments" DROP COLUMN IF EXISTS "amount"`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."payments" DROP COLUMN IF EXISTS "type"`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."payments" DROP COLUMN IF EXISTS "payment_mode"`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."payments" DROP COLUMN IF EXISTS "customer_id"`,
    );

    await queryRunner.query(
      `DROP INDEX IF EXISTS "master"."UQ_ADMIN_PC_LINE_MAPPING_LINE"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "master"."UQ_ADMIN_PC_LINE_MAPPING_ADMIN_PC_LINE"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "master"."IDX_ADMIN_PC_LINE_MAPPING_ADMIN_PC_ID"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "master"."admin_pc_line_mappings"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "master"."UQ_CAMERA_LINE_ID"`);
    await queryRunner.query(
      `ALTER TABLE "master"."cameras" DROP COLUMN IF EXISTS "health_ping_interval_seconds"`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."cameras" DROP COLUMN IF EXISTS "last_seen_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."cameras" DROP COLUMN IF EXISTS "health_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."cameras" DROP COLUMN IF EXISTS "last_health_check"`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."cameras" DROP COLUMN IF EXISTS "last_event_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."cameras" DROP COLUMN IF EXISTS "is_online"`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."cameras" DROP COLUMN IF EXISTS "ftp_directory"`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."cameras" DROP COLUMN IF EXISTS "integration_method"`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."cameras" DROP COLUMN IF EXISTS "password"`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."cameras" DROP COLUMN IF EXISTS "username"`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."cameras" DROP COLUMN IF EXISTS "port"`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."cameras" DROP COLUMN IF EXISTS "ip_address"`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."cameras" DROP COLUMN IF EXISTS "camera_name"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "master"."IDX_LINE_CENTRE_ID"`);
    await queryRunner.query(
      `ALTER TABLE "master"."lines" DROP COLUMN IF EXISTS "centre_id"`,
    );

    await queryRunner.query(`DROP INDEX IF EXISTS "master"."IDX_VEHICLE_CODE"`);
    await queryRunner.query(
      `ALTER TABLE "master"."vehicles" DROP COLUMN IF EXISTS "status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."vehicles" DROP COLUMN IF EXISTS "vin_no"`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."vehicles" DROP COLUMN IF EXISTS "code"`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."vehicles" DROP COLUMN IF EXISTS "name"`,
    );
  }

  private async revertCore(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "core"."IDX_ROLE_PERMISSION_ID"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "core"."IDX_ROLE_ROLE_NAME"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "core"."roles"`);
    await queryRunner.query(`DROP SEQUENCE IF EXISTS "core"."roles_role_id_seq"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "core"."IDX_PERMISSION_PROFILE_NAME"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "core"."permissions"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "core"."UQ_USER_LINE_MAPPING_LINE"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "core"."UQ_USER_LINE_MAPPING_USER_LINE"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "core"."IDX_USER_LINE_MAPPING_USER_ID"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "core"."user_line_mappings"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "core"."UQ_USER_CENTER_ID"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "core"."IDX_USER_ROLE_ID"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "core"."IDX_USER_USER_CODE"`);
    await queryRunner.query(
      `ALTER TABLE "core"."users" DROP COLUMN IF EXISTS "role_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "core"."users" DROP COLUMN IF EXISTS "user_code"`,
    );
    await queryRunner.query(
      `ALTER TABLE "core"."users" DROP COLUMN IF EXISTS "center_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "core"."users" DROP COLUMN IF EXISTS "created_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "core"."users" DROP COLUMN IF EXISTS "password"`,
    );
  }

  // ─── Payments table + ANPR ingestion table ───────────────────────────────────
  // Creates transaction.payments (replaces the legacy payment_transactions table),
  // links appointments.payment_id, and the opal_ivis.anpr_events ingestion table.
  private async alignPaymentsAndAnprEvents(queryRunner: QueryRunner): Promise<void> {
    const [{ paymentsTable }] = await queryRunner.query(
      `SELECT to_regclass('transaction.payments') AS "paymentsTable"`,
    );

    if (!paymentsTable) {
      await queryRunner.query(`
        CREATE TABLE "transaction"."payments" (
          "id"                bigint                NOT NULL,
          "payment_id"        integer               NOT NULL,
          "appointment_id"    bigint,
          "customer_id"       bigint                NOT NULL,
          "vehicle_record_id" bigint                NOT NULL,
          "job_id"            bigint,
          "anpr_capture_id"   bigint,
          "centre_id"         bigint,
          "line_id"           bigint,
          "camera_id"         bigint,
          "payment_type_id"   bigint,
          "status"            character varying(32) NOT NULL DEFAULT 'Paid',
          "grand_total"       numeric(12,2)         NOT NULL DEFAULT 0,
          "pay_date"          TIMESTAMP,
          "created_by"        character varying,
          "created_at"        TIMESTAMP             NOT NULL DEFAULT NOW(),
          "updated_at"        TIMESTAMP             NOT NULL DEFAULT NOW(),
          "is_deleted"        boolean               NOT NULL DEFAULT false,
          CONSTRAINT "PK_payments_id" PRIMARY KEY ("id"),
          CONSTRAINT "UQ_payments_payment_id" UNIQUE ("payment_id"),
          CONSTRAINT "FK_payments_appointment_id"
            FOREIGN KEY ("appointment_id") REFERENCES "transaction"."appointments"("id") ON DELETE NO ACTION,
          CONSTRAINT "FK_payments_customer_id"
            FOREIGN KEY ("customer_id") REFERENCES "transaction"."customers"("id") ON DELETE NO ACTION,
          CONSTRAINT "FK_payments_vehicle_record_id"
            FOREIGN KEY ("vehicle_record_id") REFERENCES "transaction"."vehicle_records"("id") ON DELETE NO ACTION,
          CONSTRAINT "FK_payments_job_id"
            FOREIGN KEY ("job_id") REFERENCES "transaction"."jobs"("id") ON DELETE NO ACTION,
          CONSTRAINT "FK_payments_anpr_capture_id"
            FOREIGN KEY ("anpr_capture_id") REFERENCES "transaction"."anpr_captures"("id") ON DELETE NO ACTION,
          CONSTRAINT "FK_payments_centre_id"
            FOREIGN KEY ("centre_id") REFERENCES "master"."centres"("id") ON DELETE NO ACTION,
          CONSTRAINT "FK_payments_line_id"
            FOREIGN KEY ("line_id") REFERENCES "master"."lines"("id") ON DELETE NO ACTION,
          CONSTRAINT "FK_payments_camera_id"
            FOREIGN KEY ("camera_id") REFERENCES "master"."cameras"("id") ON DELETE NO ACTION,
          CONSTRAINT "FK_payments_payment_type_id"
            FOREIGN KEY ("payment_type_id") REFERENCES "master"."payment_types"("id") ON DELETE NO ACTION
        )
      `);
      await queryRunner.query(
        `CREATE UNIQUE INDEX "IDX_PAYMENTS_ID" ON "transaction"."payments" ("payment_id")`,
      );
      await queryRunner.query(
        `CREATE INDEX "IDX_PAYMENT_STATUS" ON "transaction"."payments" ("status")`,
      );
      await queryRunner.query(
        `CREATE INDEX "IDX_PAYMENT_CUSTOMER_ID" ON "transaction"."payments" ("customer_id")`,
      );
    }

    // appointments → payments link (intake flow)
    await queryRunner.query(
      `ALTER TABLE "transaction"."appointments" ADD COLUMN IF NOT EXISTS "payment_id" bigint`,
    );
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_appointments_payment_id'
        ) THEN
          ALTER TABLE "transaction"."appointments"
            ADD CONSTRAINT "FK_appointments_payment_id"
            FOREIGN KEY ("payment_id") REFERENCES "transaction"."payments"("id") ON DELETE NO ACTION;
        END IF;
      END $$;
    `);

    // Remove the orphaned legacy table now replaced by transaction.payments
    await queryRunner.query(
      `DROP TABLE IF EXISTS "transaction"."payment_transactions" CASCADE`,
    );

    // opal_ivis.anpr_events — raw Hikvision ANPR ingestion table (FTP + HTTP push)
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "opal_ivis"`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "opal_ivis"."anpr_events" (
        "id"                    SERIAL PRIMARY KEY,
        "plate_number"          CHARACTER VARYING(50)  NOT NULL,
        "capture_time"          TIMESTAMPTZ            NOT NULL,
        "confidence_score"      INTEGER                NOT NULL,
        "plate_char_confidence" CHARACTER VARYING(255),
        "camera_ip"             CHARACTER VARYING(45),
        "camera_mac"            CHARACTER VARYING(17),
        "camera_code"           CHARACTER VARYING(50),
        "centre_code"           CHARACTER VARYING(50),
        "lane_number"           INTEGER,
        "vehicle_type"          CHARACTER VARYING(50),
        "vehicle_colour"        CHARACTER VARYING(50),
        "plate_colour"          CHARACTER VARYING(50),
        "plate_image_path"      TEXT,
        "scene_image_path"      TEXT,
        "integration_method"    CHARACTER VARYING(20),
        "source_method"         CHARACTER VARYING(10),
        "raw_file_response"     JSONB,
        "raw_payload"           JSONB,
        "received_at"           TIMESTAMPTZ            NOT NULL DEFAULT NOW(),
        "created_at"            TIMESTAMPTZ            NOT NULL DEFAULT NOW(),
        "updated_at"            TIMESTAMPTZ
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_anpr_events_plate_capture" ON "opal_ivis"."anpr_events" ("plate_number", "capture_time")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_plate_number" ON "opal_ivis"."anpr_events" ("plate_number")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_capture_time" ON "opal_ivis"."anpr_events" ("capture_time")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_camera_ip" ON "opal_ivis"."anpr_events" ("camera_ip")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_camera_mac" ON "opal_ivis"."anpr_events" ("camera_mac")`,
    );
  }

  private async revertPaymentsAndAnprEvents(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "opal_ivis"."anpr_events"`);
    await queryRunner.query(
      `ALTER TABLE "transaction"."appointments" DROP CONSTRAINT IF EXISTS "FK_appointments_payment_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction"."appointments" DROP COLUMN IF EXISTS "payment_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "transaction"."payments" CASCADE`);
  }
}
