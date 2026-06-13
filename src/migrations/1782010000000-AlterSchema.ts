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

    console.log('[AlterSchema] Done.');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (process.env.RUN_ALTER_SCHEMA !== 'true') {
      console.warn('[AlterSchema] down() skipped: RUN_ALTER_SCHEMA not set.');
      return;
    }

    console.log('[AlterSchema] Reverting structural alterations...');

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
      `ALTER TABLE "master"."vehicles" DROP COLUMN IF EXISTS "description"`,
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

    // appointments: add payment_mode + type (migration 1781162440262)
    await queryRunner.query(
      `ALTER TABLE "transaction"."appointments" ADD COLUMN IF NOT EXISTS "payment_mode" character varying(64)`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction"."appointments" ADD COLUMN IF NOT EXISTS "type" character varying(64)`,
    );
    await queryRunner.query(`
      UPDATE "transaction"."appointments"
      SET "payment_mode" = 'Cash', "type" = 'Standard'
      WHERE "payment_mode" IS NULL OR "type" IS NULL
    `);
    await queryRunner.query(
      `ALTER TABLE "transaction"."appointments" ALTER COLUMN "payment_mode" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction"."appointments" ALTER COLUMN "type" SET NOT NULL`,
    );

    // anpr_captures / rop_verifications / jobs / payment_transactions indexes
    // (idempotent — only created if absent)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_ANPR_CAPTURE_CAMERA_PLATE_TIME"
      ON "transaction"."anpr_captures" ("camera_id", "plate_number", "capture_time")
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_ANPR_CAPTURE_CAMERA_TIME" ON "transaction"."anpr_captures" ("camera_id", "capture_time")`,
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
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_PAYMENT_TRANSACTION_CUSTOMER_ID" ON "transaction"."payment_transactions" ("customer_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_PAYMENT_TRANSACTION_STATUS" ON "transaction"."payment_transactions" ("status")`,
    );
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
  }

  // ─── Revert helpers ───────────────────────────────────────────────────────────

  private async revertForeignKeys(queryRunner: QueryRunner): Promise<void> {
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
      `DROP INDEX IF EXISTS "transaction"."IDX_ANPR_CAPTURE_CAMERA_TIME"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "transaction"."UQ_ANPR_CAPTURE_CAMERA_PLATE_TIME"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction"."appointments" ALTER COLUMN "type" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction"."appointments" ALTER COLUMN "payment_mode" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction"."appointments" DROP COLUMN IF EXISTS "type"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction"."appointments" DROP COLUMN IF EXISTS "payment_mode"`,
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
}
