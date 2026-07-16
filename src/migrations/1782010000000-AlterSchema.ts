import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bump this whenever this file's DDL changes. SchemaBootstrapService compares
 * it against `onboarding_status.schema_version` at boot and skips re-running
 * this migration's ~400 statements when they already match — see
 * SchemaBootstrapService for the skip logic. Forgetting to bump this after a
 * real schema change just means the next boot re-applies it anyway (every
 * statement here is idempotent), so it fails safe, not silently stale.
 */
export const ALTER_SCHEMA_VERSION = 3;

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
    await this.alignAdminPcsAndCameraMultiLine(queryRunner);

    console.log('[AlterSchema] Done.');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (process.env.RUN_ALTER_SCHEMA !== 'true') {
      console.warn('[AlterSchema] down() skipped: RUN_ALTER_SCHEMA not set.');
      return;
    }

    console.log('[AlterSchema] Reverting structural alterations...');

    await this.revertAdminPcsAndCameraMultiLine(queryRunner);
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
    await queryRunner.query(
      `ALTER TABLE "core"."users" DROP COLUMN IF EXISTS "center"`,
    );
    await queryRunner.query(
      `ALTER TABLE "core"."users" DROP COLUMN IF EXISTS "line"`,
    );
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
    await queryRunner.query(
      `DROP INDEX IF EXISTS "core"."IDX_USER_ROLE_ACCESS_ID"`,
    );
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
    // Multiple users may share the same centre — drop the old unique constraint
    // and keep a plain index for center_id lookups. Two historically-different
    // names have been seen for this same leftover partial-unique index
    // depending on how a given DB was originally created (a hand-named
    // "UQ_USER_CENTER_ID" from an early migration, vs. a lowercase/underscore
    // "UQ_users_center_id" — confirmed live via pg_indexes, see the FK-error
    // "duplicate key value violates unique constraint UQ_users_center_id"
    // this fixes) — drop both explicitly so this is idempotent regardless of
    // which one a given database actually has.
    await queryRunner.query(`DROP INDEX IF EXISTS "core"."UQ_USER_CENTER_ID"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "core"."UQ_users_center_id"`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_USER_CENTER_ID" ON "core"."users" ("center_id")`,
    );

    // Re-scoped Super Admin login (see ONBOARDING_DB_SYNC_ARCHITECTURE.md):
    // marks a locally-copied Super Admin row so login re-verifies it against
    // the central password when reachable, falling back to the local hash
    // when central is down. Never set on organic/normally-synced local users.
    await queryRunner.query(
      `ALTER TABLE "core"."users" ADD COLUMN IF NOT EXISTS "requires_central_revalidation" boolean NOT NULL DEFAULT false`,
    );

    // user_sessions: add created_by (migration 1779720300000)
    await queryRunner.query(
      `ALTER TABLE "core"."user_sessions" ADD COLUMN IF NOT EXISTS "created_by" character varying`,
    );

    // user_sessions: impersonated_by — set only on sessions minted via Super
    // Admin impersonation (see Part 7, "Login as Centre Admin"); holds the
    // acting Super Admin's user id, null on every normal login/refresh.
    await queryRunner.query(
      `ALTER TABLE "core"."user_sessions" ADD COLUMN IF NOT EXISTS "impersonated_by" character varying`,
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
    // Lines are shareable across users — drop the one-user-per-line constraint.
    await queryRunner.query(
      `DROP INDEX IF EXISTS "core"."UQ_USER_LINE_MAPPING_LINE"`,
    );

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
    // roles.access_scope: 'global' (Super Admin, all centres) | 'centre' (Centre Admin, single centre)
    await queryRunner.query(
      `ALTER TABLE "core"."roles" ADD COLUMN IF NOT EXISTS "access_scope" varchar(16) NOT NULL DEFAULT 'centre'`,
    );
    // roles.is_center_admin: centre-admin rank within a centre (meaningful only for centre scope)
    await queryRunner.query(
      `ALTER TABLE "core"."roles" ADD COLUMN IF NOT EXISTS "is_center_admin" boolean NOT NULL DEFAULT false`,
    );
    // roles.center_id: owning centre (NULL → global/system role). Tenant-scoped roles.
    await queryRunner.query(
      `ALTER TABLE "core"."roles" ADD COLUMN IF NOT EXISTS "center_id" bigint`,
    );
    // Role names are unique per owning centre (globals unique among themselves):
    // drop the old global-unique index/constraint and add a composite unique on
    // (center_id, role_name).
    await queryRunner.query(`DROP INDEX IF EXISTS "core"."IDX_ROLE_ROLE_NAME"`);
    await queryRunner.query(
      `ALTER TABLE "core"."roles" DROP CONSTRAINT IF EXISTS "UQ_roles_role_name"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_ROLE_CENTER_ROLE_NAME" ON "core"."roles" ("center_id", "role_name")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_ROLE_CENTER_ID" ON "core"."roles" ("center_id")`,
    );
    // FK roles.center_id → master.centres(id)
    await queryRunner.query(
      `ALTER TABLE "core"."roles" DROP CONSTRAINT IF EXISTS "FK_roles_center_id"`,
    );
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'master' AND table_name = 'centres'
        ) THEN
          ALTER TABLE "core"."roles"
          ADD CONSTRAINT "FK_roles_center_id"
          FOREIGN KEY ("center_id") REFERENCES "master"."centres"("id") ON DELETE SET NULL;
        END IF;
      END $$;
    `);
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
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_ROLE_PERMISSION_ID" ON "core"."roles" ("permission_id")`,
    );

    // role_centre_mappings: Role↔Centre becomes many-to-many — one role (e.g.
    // "Center Admin") can now be linked to several centres instead of every
    // centre needing its own duplicate role. Mirrors user_line_mappings.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "core"."role_centre_mappings" (
        "id"          bigint    NOT NULL,
        "role_id"     bigint    NOT NULL,
        "centre_id"   bigint    NOT NULL,
        "created_by"  character varying,
        "created_at"  TIMESTAMP NOT NULL DEFAULT NOW(),
        "updated_at"  TIMESTAMP NOT NULL DEFAULT NOW(),
        "is_deleted"  boolean   NOT NULL DEFAULT false,
        CONSTRAINT "PK_role_centre_mappings_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_ROLE_CENTRE_MAPPING_ROLE_ID" ON "core"."role_centre_mappings" ("role_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_ROLE_CENTRE_MAPPING_CENTRE_ID" ON "core"."role_centre_mappings" ("centre_id")`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_ROLE_CENTRE_MAPPING_ROLE_CENTRE"
      ON "core"."role_centre_mappings" ("role_id", "centre_id")
      WHERE "is_deleted" = false
    `);
    await queryRunner.query(
      `ALTER TABLE "core"."role_centre_mappings" DROP CONSTRAINT IF EXISTS "FK_role_centre_mappings_role_id"`,
    );
    await queryRunner.query(`
      ALTER TABLE "core"."role_centre_mappings"
      ADD CONSTRAINT "FK_role_centre_mappings_role_id"
      FOREIGN KEY ("role_id") REFERENCES "core"."roles"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(
      `ALTER TABLE "core"."role_centre_mappings" DROP CONSTRAINT IF EXISTS "FK_role_centre_mappings_centre_id"`,
    );
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'master' AND table_name = 'centres'
        ) THEN
          ALTER TABLE "core"."role_centre_mappings"
          ADD CONSTRAINT "FK_role_centre_mappings_centre_id"
          FOREIGN KEY ("centre_id") REFERENCES "master"."centres"("id") ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    // Backfill: one mapping row per role that still has a (pre-M:N) center_id.
    // One-time bootstrap IDs — no app process available at migration time to
    // call the real snowflake generator, so a random 60-bit positive bigint
    // is used instead (collision-safe for the small, one-time backfill set;
    // never re-used as a real ID-generation strategy elsewhere).
    await queryRunner.query(`
      INSERT INTO "core"."role_centre_mappings"
        ("id", "role_id", "centre_id", "created_by", "is_deleted")
      SELECT
        ('x' || substr(md5(random()::text || clock_timestamp()::text), 1, 15))::bit(60)::bigint,
        "id",
        "center_id",
        "created_by",
        false
      FROM "core"."roles"
      WHERE "center_id" IS NOT NULL
      ON CONFLICT DO NOTHING
    `);

    // Drop the old single-centre scalar now that role_centre_mappings is the
    // source of truth — one source of truth, no stale field left behind.
    await queryRunner.query(
      `DROP INDEX IF EXISTS "core"."IDX_ROLE_CENTER_ROLE_NAME"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "core"."IDX_ROLE_CENTER_ID"`,
    );
    await queryRunner.query(
      `ALTER TABLE "core"."roles" DROP CONSTRAINT IF EXISTS "FK_roles_center_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "core"."roles" DROP COLUMN IF EXISTS "center_id"`,
    );
    // Role names are now unique globally — create one role once, link many centres.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_ROLE_ROLE_NAME" ON "core"."roles" ("role_name")`,
    );

    // configuration: one settings row per centre (sync mode, redo test,
    // auto-close, payment mandatory, working hours).
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "core"."configuration" (
        "id"                  bigint                NOT NULL,
        "configuration_id"    integer               NOT NULL,
        "centre_id"           bigint                NOT NULL,
        "sync_mode"           character varying(16) NOT NULL DEFAULT 'Manual',
        "sync_time_morning"   character varying(5),
        "sync_time_evening"   character varying(5),
        "redo_test_enabled"   boolean               NOT NULL DEFAULT true,
        "auto_close"          boolean               NOT NULL DEFAULT false,
        "auto_close_time"     character varying(5),
        "payment_mandatory"   boolean               NOT NULL DEFAULT true,
        "working_hours_start" character varying(5),
        "working_hours_end"   character varying(5),
        "status"              character varying(32) NOT NULL DEFAULT 'Active',
        "created_by"          character varying,
        "created_at"          TIMESTAMP             NOT NULL DEFAULT NOW(),
        "updated_at"          TIMESTAMP             NOT NULL DEFAULT NOW(),
        "is_deleted"          boolean               NOT NULL DEFAULT false,
        CONSTRAINT "PK_configuration_id" PRIMARY KEY ("id")
      )
    `);
    // Database Sync (ongoing) — Automatic mode's twice-daily run times, per
    // centre. Added after the table already existed on some DBs, so also
    // guarded here for those (the CREATE TABLE above only helps fresh DBs).
    await queryRunner.query(
      `ALTER TABLE "core"."configuration" ADD COLUMN IF NOT EXISTS "sync_time_morning" character varying(5)`,
    );
    await queryRunner.query(
      `ALTER TABLE "core"."configuration" ADD COLUMN IF NOT EXISTS "sync_time_evening" character varying(5)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_CONFIGURATION_CONFIGURATION_ID" ON "core"."configuration" ("configuration_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_CONFIGURATION_CENTRE_ID" ON "core"."configuration" ("centre_id")`,
    );
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_configuration_centre_id') THEN
          ALTER TABLE "core"."configuration"
            ADD CONSTRAINT "FK_configuration_centre_id"
            FOREIGN KEY ("centre_id") REFERENCES "master"."centres"("id") ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    // onboarding_status table (Onboarding Sync feature) — single-row table
    // tracking this local DB's onboarding lifecycle: PENDING ->
    // PENDING_CONFIRMATION -> IN_PROGRESS -> COMPLETED/FAILED.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "core"."onboarding_status" (
        "id"                      bigint                NOT NULL,
        "centre_id"               bigint,
        "centre_code"             character varying,
        "status"                  character varying(32) NOT NULL DEFAULT 'PENDING',
        "confirmation_expires_at" TIMESTAMP,
        "schema_initialized_at"   TIMESTAMP,
        "data_synced_at"          TIMESTAMP,
        "last_error"              character varying,
        "schema_version"          character varying,
        "created_at"              TIMESTAMP             NOT NULL DEFAULT NOW(),
        "updated_at"              TIMESTAMP             NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_onboarding_status_id" PRIMARY KEY ("id")
      )
    `);
    // Existing deployments from before schema_version existed — add it here too.
    await queryRunner.query(`
      ALTER TABLE "core"."onboarding_status"
        ADD COLUMN IF NOT EXISTS "schema_version" character varying
    `);

    // sync_state / sync_entity_config (old DB-connection-based Database Sync,
    // see DATABASE_SYNC_ENTITY_CONFIG_PLAN.md) are retired — replaced by the
    // HTTPS-only architecture (Database_sync_arch_replan.md). Explicit DROPs
    // here (not just removed CREATE blocks) so any DB that already ran the
    // old version of this migration gets cleaned up on next boot too.
    await queryRunner.query(`DROP TABLE IF EXISTS "core"."sync_entity_config" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "core"."sync_state" CASCADE`);

    // sync_run_log table (new HTTPS-only Database Sync, see
    // Database_sync_arch_replan.md §10/§11) — append-only history, one row
    // per sync run, replacing the old single-row sync_state cursor table.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "core"."sync_run_log" (
        "id"          bigint                NOT NULL,
        "started_at"  TIMESTAMP             NOT NULL,
        "finished_at" TIMESTAMP,
        "status"      character varying(16) NOT NULL DEFAULT 'IN_PROGRESS',
        "pushed"      jsonb                 NOT NULL DEFAULT '{}',
        "pulled"      jsonb                 NOT NULL DEFAULT '{}',
        "error"       character varying,
        "created_at"  TIMESTAMP             NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_sync_run_log_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_SYNC_RUN_LOG_STARTED_AT"
      ON "core"."sync_run_log" ("started_at")
    `);

    // audit_logs — append-only user activity trail (who/what/when/where).
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "core"."audit_logs" (
        "id"           bigint                 NOT NULL,
        "user_id"      bigint,
        "user_name"    character varying(255),
        "action"       character varying(32)  NOT NULL,
        "entity_type"  character varying(128),
        "entity_id"    character varying(64),
        "description"  character varying(512) NOT NULL,
        "ip_address"   character varying(64),
        "user_agent"   character varying(512),
        "before"       jsonb,
        "after"        jsonb,
        "created_at"   TIMESTAMPTZ            NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_audit_logs_id" PRIMARY KEY ("id")
      )
    `);
    // Existing envs created created_at as TIMESTAMP (Asia/Calcutta wall-clock).
    // Promote to TIMESTAMPTZ interpreting old values as India local so GST/UTC
    // display matches the real instant (avoids "tomorrow 01:xx GST" skew).
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'core'
            AND table_name = 'audit_logs'
            AND column_name = 'created_at'
            AND data_type = 'timestamp without time zone'
        ) THEN
          ALTER TABLE "core"."audit_logs"
            ALTER COLUMN "created_at" TYPE TIMESTAMPTZ
            USING "created_at" AT TIME ZONE 'Asia/Kolkata';
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_AUDIT_LOGS_CREATED_AT"
      ON "core"."audit_logs" ("created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_AUDIT_LOGS_USER_ID"
      ON "core"."audit_logs" ("user_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_AUDIT_LOGS_ENTITY_TYPE"
      ON "core"."audit_logs" ("entity_type")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_AUDIT_LOGS_ACTION"
      ON "core"."audit_logs" ("action")
    `);

    // centre_api_keys table (central-side only — see
    // Database_sync_arch_replan.md §4/§5) — per-centre API key hash, minted
    // at the end of that centre's Onboarding Sync pull, used to authenticate
    // every subsequent Database Sync run via ApiKeyGuard.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "core"."centre_api_keys" (
        "id"          bigint    NOT NULL,
        "centre_id"   bigint    NOT NULL,
        "key_hash"    character varying NOT NULL,
        "created_at"  TIMESTAMP NOT NULL DEFAULT NOW(),
        "revoked_at"  TIMESTAMP,
        CONSTRAINT "PK_centre_api_keys_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_CENTRE_API_KEYS_CENTRE_ID"
      ON "core"."centre_api_keys" ("centre_id")
    `);
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
    // lines: per-line IN/OUT folder paths for file-driven processing
    await queryRunner.query(
      `ALTER TABLE "master"."lines" ADD COLUMN IF NOT EXISTS "in_file_path" varchar(512)`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."lines" ADD COLUMN IF NOT EXISTS "out_file_path" varchar(512)`,
    );

    // admin_pcs: drop legacy line_id column and add centre_id (migration 1780120000000),
    // then drop centre_id and restore line_id via admin_pc_line_mappings (1780170000000 / 1781174000000)
    await queryRunner.query(
      `ALTER TABLE "master"."admin_pcs" DROP CONSTRAINT IF EXISTS "FK_admin_pcs_line_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "master"."UQ_admin_pcs_line_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "master"."UQ_ADMIN_PC_LINE_ID"`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."admin_pcs" DROP COLUMN IF EXISTS "line_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."admin_pcs" DROP CONSTRAINT IF EXISTS "FK_admin_pcs_centre_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "master"."IDX_ADMIN_PC_CENTRE_ID"`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."admin_pcs" DROP COLUMN IF EXISTS "centre_id"`,
    );
    // admin_pcs: IN/OUT folder paths for the file-driven inspection flow.
    await queryRunner.query(
      `ALTER TABLE "master"."admin_pcs" ADD COLUMN IF NOT EXISTS "in_file_path" character varying(512)`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."admin_pcs" ADD COLUMN IF NOT EXISTS "out_file_path" character varying(512)`,
    );

    // admin_pcs: add center_id column (center scope implementation)
    await queryRunner.query(
      `ALTER TABLE "master"."admin_pcs" ADD COLUMN IF NOT EXISTS "center_id" bigint`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_ADMIN_PC_CENTER_ID" ON "master"."admin_pcs" ("center_id")`,
    );
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 
          FROM information_schema.table_constraints 
          WHERE constraint_name = 'FK_ADMIN_PC_CENTER_ID' 
            AND table_name = 'admin_pcs'
        ) THEN
          ALTER TABLE "master"."admin_pcs"
          ADD CONSTRAINT "FK_ADMIN_PC_CENTER_ID"
          FOREIGN KEY ("center_id")
          REFERENCES "master"."centres"("id")
          ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    // cameras: drop unique constraint added by Initalization and keep partial unique index
    await queryRunner.query(
      `ALTER TABLE "master"."cameras" DROP CONSTRAINT IF EXISTS "UQ_b3a5f72708eb14f0b044646653b"`,
    );
    // cameras.line_id is later migrated to the camera_line_mappings join table
    // (see migrateAdminPcsAndCameraMultiLine below); only (re)create this index
    // while the legacy column still exists.
    if (await queryRunner.hasColumn('master.cameras', 'line_id')) {
      await queryRunner.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS "UQ_CAMERA_LINE_ID" ON "master"."cameras" ("line_id")
        WHERE "is_deleted" = false
      `);
    }

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
    // Per-line IN/OUT folder paths (configured on the Configuration screen).
    await queryRunner.query(
      `ALTER TABLE "master"."admin_pc_line_mappings" ADD COLUMN IF NOT EXISTS "in_file_path" character varying(512)`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."admin_pc_line_mappings" ADD COLUMN IF NOT EXISTS "out_file_path" character varying(512)`,
    );

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
        "vehicle_type"    character varying(64) NOT NULL DEFAULT '',
        "category"        character varying   NOT NULL,
        "center_charges"  numeric(12,3)       NOT NULL DEFAULT 0,
        "rop_charges"     numeric(12,3)       NOT NULL DEFAULT 0,
        "category_charges" numeric(12,3)      NOT NULL DEFAULT 0,
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
    // Existing DBs from before category_charges existed — add it here too.
    await queryRunner.query(
      `ALTER TABLE "master"."charges" ADD COLUMN IF NOT EXISTS "category_charges" numeric(12,3) NOT NULL DEFAULT 0`,
    );
    // (vehicle_id index + combo are created below on vehicle_type — charges use a
    // free-text vehicle_type, not a FK to the vehicle master.)

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
        "engine_capacity"  character varying(128),
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
    // engine_capacity is optional (existing DBs created it NOT NULL).
    await queryRunner.query(
      `ALTER TABLE "master"."charge_categories" ALTER COLUMN "engine_capacity" DROP NOT NULL`,
    );
    // fees moved to charges.category_charges (per-Charge, not per-Category) — drop here.
    await queryRunner.query(
      `ALTER TABLE "master"."charge_categories" DROP COLUMN IF EXISTS "fees"`,
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

    // charges: vehicle is now a FREE-TEXT vehicle_type (operator-entered), not a
    // FK to the vehicle master. Drop the FK/index/column and re-key the combo.
    await queryRunner.query(
      `ALTER TABLE "master"."charges" ADD COLUMN IF NOT EXISTS "vehicle_type" character varying(64) NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."charges" DROP CONSTRAINT IF EXISTS "FK_charges_vehicle_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "master"."IDX_CHARGE_VEHICLE_ID"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "master"."IDX_CHARGE_UNIQUE_COMBO"`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."charges" DROP COLUMN IF EXISTS "vehicle_id"`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_CHARGE_UNIQUE_COMBO"
        ON "master"."charges" ("centre_id", "vehicle_type", "charge_category_id")
        WHERE "is_deleted" = false
    `);

    // vehicles: add body type + category (FK to charge_categories master)
    await queryRunner.query(
      `ALTER TABLE "master"."vehicles" ADD COLUMN IF NOT EXISTS "vehicle_type" character varying(64)`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."vehicles" ADD COLUMN IF NOT EXISTS "charge_category_id" bigint`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_VEHICLE_CHARGE_CATEGORY_ID" ON "master"."vehicles" ("charge_category_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."vehicles" DROP CONSTRAINT IF EXISTS "FK_vehicles_charge_category_id"`,
    );
    await queryRunner.query(`
      ALTER TABLE "master"."vehicles"
      ADD CONSTRAINT "FK_vehicles_charge_category_id"
      FOREIGN KEY ("charge_category_id") REFERENCES "master"."charge_categories"("id") ON DELETE NO ACTION
    `);

    // centres: auto-submit completed jobs to ROP (centre-level config).
    await queryRunner.query(
      `ALTER TABLE "master"."centres" ADD COLUMN IF NOT EXISTS "auto_submit" boolean NOT NULL DEFAULT false`,
    );

    // Code uniqueness must ignore soft-deleted rows: replace ALL plain UNIQUE
    // constraints/indexes on `code` with a PARTIAL unique index
    // (WHERE is_deleted = false), so a `code` can be reused after its owning row
    // is soft-deleted. Stray/legacy index names (e.g. IDX_LINES_CODE) are removed
    // generically by inspecting the catalog, not by hardcoded names.
    const codeUniques: Array<{ table: string; index: string }> = [
      { table: 'vehicles', index: 'IDX_VEHICLE_CODE' },
      { table: 'tests', index: 'IDX_TEST_CODE' },
      { table: 'centres', index: 'IDX_CENTRE_CODE' },
      { table: 'lines', index: 'IDX_LINE_CODE' },
      { table: 'admin_pcs', index: 'IDX_ADMIN_PC_CODE' },
      { table: 'cameras', index: 'IDX_CAMERA_CODE' },
      { table: 'payments', index: 'IDX_PAYMENT_CODE' },
      { table: 'payment_types', index: 'IDX_PT_CODE' },
    ];
    for (const u of codeUniques) {
      // Drop every non-partial unique constraint/index on the `code` column,
      // whatever it's named, then (re)create the canonical partial unique index.
      await queryRunner.query(`
        DO $$
        DECLARE r record;
        BEGIN
          FOR r IN
            SELECT con.conname
            FROM pg_constraint con
            JOIN pg_class t ON t.oid = con.conrelid
            JOIN pg_namespace n ON n.oid = t.relnamespace
            WHERE n.nspname = 'master' AND t.relname = '${u.table}'
              AND con.contype = 'u'
              AND pg_get_constraintdef(con.oid) ILIKE '%(code)%'
          LOOP
            EXECUTE format('ALTER TABLE "master".%I DROP CONSTRAINT %I', '${u.table}', r.conname);
          END LOOP;

          FOR r IN
            SELECT i.relname AS idxname
            FROM pg_index x
            JOIN pg_class i ON i.oid = x.indexrelid
            JOIN pg_class t ON t.oid = x.indrelid
            JOIN pg_namespace n ON n.oid = t.relnamespace
            WHERE n.nspname = 'master' AND t.relname = '${u.table}'
              AND x.indisunique AND x.indpred IS NULL
              AND pg_get_indexdef(x.indexrelid) ILIKE '%(code)%'
          LOOP
            EXECUTE format('DROP INDEX IF EXISTS "master".%I', r.idxname);
          END LOOP;
        END $$;
      `);
      await queryRunner.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS "${u.index}" ON "master"."${u.table}" ("code") WHERE "is_deleted" = false`,
      );
    }
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

    // appointments: thin booking record. The denormalized customer/vehicle
    // snapshot columns are dropped — those details are read through the customer
    // / vehicle_record / anpr_capture relations. Only the booking kind is kept
    // on the row (the FK id columns remain). booking_type is NOT backfilled from
    // anpr_capture_id: walk-ins also create an ANPR capture, so that heuristic
    // wrongly flipped Walk-in → Online.
    await queryRunner.query(
      `ALTER TABLE "transaction"."appointments" ADD COLUMN IF NOT EXISTS "booking_type" character varying(16) NOT NULL DEFAULT 'Walk-in'`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction"."appointments" DROP CONSTRAINT IF EXISTS "FK_appointments_payment_type_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction"."appointments" DROP CONSTRAINT IF EXISTS "FK_appointments_charge_category_id"`,
    );
    for (const col of [
      'type',
      'payment_type_id',
      'payment_mode',
      'vehicle_type',
      'charge_category_id',
      'owner_name',
      'plate_color',
      'plate_number',
      'customer_name',
      'customer_phone',
      'id_number',
    ]) {
      await queryRunner.query(
        `ALTER TABLE "transaction"."appointments" DROP COLUMN IF EXISTS "${col}"`,
      );
    }

    // jobs: invoice + parsed OUT test results (job-management flow). Driver
    // details now live on the customer, and source is replaced by appointment_id.
    await queryRunner.query(
      `ALTER TABLE "transaction"."jobs" ADD COLUMN IF NOT EXISTS "invoice_no" character varying(64)`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction"."jobs" ADD COLUMN IF NOT EXISTS "invoice_date" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction"."jobs" ADD COLUMN IF NOT EXISTS "test_results" jsonb`,
    );
    // jobs: driver columns removed (moved to customers).
    await queryRunner.query(
      `ALTER TABLE "transaction"."jobs" DROP COLUMN IF EXISTS "driver_name"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction"."jobs" DROP COLUMN IF EXISTS "driver_phone"`,
    );
    // jobs: source replaced by an appointment FK (booking type read via relation).
    await queryRunner.query(
      `ALTER TABLE "transaction"."jobs" DROP COLUMN IF EXISTS "source"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction"."jobs" ADD COLUMN IF NOT EXISTS "appointment_id" bigint`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_JOB_APPOINTMENT_ID" ON "transaction"."jobs" ("appointment_id")`,
    );
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_jobs_appointment_id') THEN
          ALTER TABLE "transaction"."jobs"
            ADD CONSTRAINT "FK_jobs_appointment_id"
            FOREIGN KEY ("appointment_id") REFERENCES "transaction"."appointments"("id") ON DELETE NO ACTION;
        END IF;
      END $$;
    `);

    // job_images table — manually-uploaded / camera-captured photos for a job
    // (Test & Submit step's Images card). ANPR-sourced images stay on
    // anpr_captures.image_url/scene_image_url and are not duplicated here.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "transaction"."job_images" (
        "id"          bigint                NOT NULL,
        "job_id"      bigint                NOT NULL,
        "image_url"   character varying     NOT NULL,
        "source"      character varying(16) NOT NULL,
        "created_by"  character varying,
        "created_at"  TIMESTAMP             NOT NULL DEFAULT NOW(),
        "updated_at"  TIMESTAMP             NOT NULL DEFAULT NOW(),
        "is_deleted"  boolean               NOT NULL DEFAULT false,
        CONSTRAINT "PK_job_images_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_JOB_IMAGE_JOB_ID" ON "transaction"."job_images" ("job_id")`,
    );
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_job_images_job_id') THEN
          ALTER TABLE "transaction"."job_images"
            ADD CONSTRAINT "FK_job_images_job_id"
            FOREIGN KEY ("job_id") REFERENCES "transaction"."jobs"("id") ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    // customers: driver details now stored here (driver_phone_number).
    await queryRunner.query(
      `ALTER TABLE "transaction"."customers" ADD COLUMN IF NOT EXISTS "driver_name" character varying(128)`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction"."customers" ADD COLUMN IF NOT EXISTS "driver_phone_number" character varying(32)`,
    );
    // Rename any legacy driver_phone → driver_phone_number, then drop the leftover.
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'transaction' AND table_name = 'customers' AND column_name = 'driver_phone'
        ) THEN
          UPDATE "transaction"."customers"
            SET "driver_phone_number" = COALESCE("driver_phone_number", "driver_phone");
          ALTER TABLE "transaction"."customers" DROP COLUMN "driver_phone";
        END IF;
      END $$;
    `);

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
    // anpr_captures: pointer to the current/latest ROP verification row.
    await queryRunner.query(
      `ALTER TABLE "transaction"."anpr_captures" ADD COLUMN IF NOT EXISTS "rop_verification_id" bigint`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_ANPR_CAPTURE_ROP_VERIFICATION_ID" ON "transaction"."anpr_captures" ("rop_verification_id")`,
    );
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_anpr_captures_rop_verification_id') THEN
          ALTER TABLE "transaction"."anpr_captures"
            ADD CONSTRAINT "FK_anpr_captures_rop_verification_id"
            FOREIGN KEY ("rop_verification_id") REFERENCES "transaction"."rop_verifications"("id") ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    // ROP fetch status: auto-created (anpr-system) verifications were wrongly
    // marked 'Fetched' by the stub. With no real ROP API yet they must be
    // 'Pending'; also clear the capture pointer that was stamped for them.
    await queryRunner.query(`
      UPDATE "transaction"."anpr_captures" SET "rop_verification_id" = NULL
      WHERE "rop_verification_id" IN (
        SELECT "id" FROM "transaction"."rop_verifications"
        WHERE "created_by" = 'anpr-system' AND "fetch_status" = 'Fetched'
      )
    `);
    await queryRunner.query(
      `UPDATE "transaction"."rop_verifications" SET "fetch_status" = 'Pending' WHERE "created_by" = 'anpr-system' AND "fetch_status" = 'Fetched'`,
    );

    // vehicle_type is free text stored lowercase for reliable charge comparison —
    // normalize any existing values across the tables that carry it.
    await queryRunner.query(
      `UPDATE "master"."charges" SET "vehicle_type" = LOWER(TRIM("vehicle_type")) WHERE "vehicle_type" IS NOT NULL AND "vehicle_type" <> LOWER(TRIM("vehicle_type"))`,
    );
    await queryRunner.query(
      `UPDATE "master"."vehicles" SET "vehicle_type" = LOWER(TRIM("vehicle_type")) WHERE "vehicle_type" IS NOT NULL AND "vehicle_type" <> LOWER(TRIM("vehicle_type"))`,
    );
    await queryRunner.query(
      `UPDATE "transaction"."vehicle_records" SET "vehicle_type" = LOWER(TRIM("vehicle_type")) WHERE "vehicle_type" IS NOT NULL AND "vehicle_type" <> LOWER(TRIM("vehicle_type"))`,
    );
    await queryRunner.query(
      `UPDATE "transaction"."anpr_captures" SET "vehicle_type" = LOWER(TRIM("vehicle_type")) WHERE "vehicle_type" IS NOT NULL AND "vehicle_type" <> LOWER(TRIM("vehicle_type"))`,
    );

    // customers: align columns with entity — rename name → customer_name,
    // phone → customer_phone_number, primary_vehicle_record_id → vehicle_record_id,
    // add owner_phone_number + plate_number, drop the removed alternate_phone,
    // and rename the related index / FK constraint.
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
          WHERE table_schema = 'transaction' AND table_name = 'customers' AND column_name = 'phone'
        ) THEN
          ALTER TABLE "transaction"."customers" RENAME COLUMN "phone" TO "customer_phone_number";
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
      `ALTER TABLE "transaction"."customers" ADD COLUMN IF NOT EXISTS "owner_phone_number" character varying(32)`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction"."customers" ADD COLUMN IF NOT EXISTS "plate_number" character varying(32)`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction"."customers" DROP COLUMN IF EXISTS "alternate_phone"`,
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

    // customers: the customer's identity is the owner. Consolidate the legacy
    // customer_name / customer_phone_number into owner_name / owner_phone_number,
    // drop the duplicates, then enforce NOT NULL (backfilling any gaps).
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'transaction' AND table_name = 'customers' AND column_name = 'customer_name'
        ) THEN
          UPDATE "transaction"."customers" SET "owner_name" = COALESCE("owner_name", "customer_name");
          ALTER TABLE "transaction"."customers" DROP COLUMN "customer_name";
        END IF;
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'transaction' AND table_name = 'customers' AND column_name = 'customer_phone_number'
        ) THEN
          UPDATE "transaction"."customers" SET "owner_phone_number" = COALESCE("owner_phone_number", "customer_phone_number");
          ALTER TABLE "transaction"."customers" DROP COLUMN "customer_phone_number";
        END IF;
      END $$;
    `);
    await queryRunner.query(
      `UPDATE "transaction"."customers" SET "owner_name" = 'Unknown' WHERE "owner_name" IS NULL`,
    );
    await queryRunner.query(
      `UPDATE "transaction"."customers" SET "owner_phone_number" = '' WHERE "owner_phone_number" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction"."customers" ALTER COLUMN "owner_name" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction"."customers" ALTER COLUMN "owner_phone_number" SET NOT NULL`,
    );
    // Phone index now tracks owner_phone_number.
    await queryRunner.query(
      `DROP INDEX IF EXISTS "transaction"."IDX_CUSTOMER_PHONE"`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_CUSTOMER_PHONE" ON "transaction"."customers" ("owner_phone_number")`,
    );

    // anpr_captures / rop_verifications / jobs / payment_transactions indexes
    // (idempotent — only created if absent)
    // line_id-based indexes replace the legacy camera_id-based ones (entity-aligned).
    await queryRunner.query(
      `DROP INDEX IF EXISTS "transaction"."UQ_ANPR_CAPTURE_CAMERA_PLATE_TIME"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "transaction"."IDX_ANPR_CAPTURE_CAMERA_TIME"`,
    );
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

    // master.charges no longer references master.vehicles — vehicle is free-text
    // vehicle_type now. Ensure any legacy FK is dropped.
    await queryRunner.query(
      `ALTER TABLE "master"."charges" DROP CONSTRAINT IF EXISTS "FK_charges_vehicle_id"`,
    );
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
    await queryRunner.query(
      `DROP TABLE IF EXISTS "transaction"."job_images" CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction"."appointments" DROP COLUMN IF EXISTS "booking_type"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction"."appointments" DROP COLUMN IF EXISTS "owner_name"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction"."appointments" DROP COLUMN IF EXISTS "plate_color"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction"."jobs" DROP CONSTRAINT IF EXISTS "FK_jobs_appointment_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "transaction"."IDX_JOB_APPOINTMENT_ID"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction"."jobs" DROP COLUMN IF EXISTS "appointment_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction"."jobs" DROP COLUMN IF EXISTS "driver_name"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction"."jobs" DROP COLUMN IF EXISTS "driver_phone"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction"."jobs" DROP COLUMN IF EXISTS "invoice_no"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction"."jobs" DROP COLUMN IF EXISTS "invoice_date"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction"."jobs" DROP COLUMN IF EXISTS "test_results"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction"."customers" DROP COLUMN IF EXISTS "driver_name"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction"."customers" DROP COLUMN IF EXISTS "driver_phone_number"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction"."customers" DROP COLUMN IF EXISTS "plate_number"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "transaction"."IDX_PAYMENT_TRANSACTION_STATUS"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "transaction"."IDX_PAYMENT_TRANSACTION_CUSTOMER_ID"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "transaction"."IDX_APPOINTMENT_CUSTOMER_ID"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "transaction"."IDX_APPOINTMENT_ANPR_CAPTURE_ID"`,
    );
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
      `ALTER TABLE "transaction"."anpr_captures" DROP CONSTRAINT IF EXISTS "FK_anpr_captures_rop_verification_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "transaction"."IDX_ANPR_CAPTURE_ROP_VERIFICATION_ID"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction"."anpr_captures" DROP COLUMN IF EXISTS "rop_verification_id"`,
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
      `ALTER TABLE "transaction"."appointments" DROP CONSTRAINT IF EXISTS "FK_appointments_charge_category_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "transaction"."IDX_APPOINTMENT_CHARGE_CATEGORY_ID"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction"."appointments" DROP COLUMN IF EXISTS "charge_category_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction"."appointments" DROP COLUMN IF EXISTS "vehicle_type"`,
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
    await queryRunner.query(
      `ALTER TABLE "master"."admin_pcs" DROP COLUMN IF EXISTS "in_file_path"`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."admin_pcs" DROP COLUMN IF EXISTS "out_file_path"`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."admin_pc_line_mappings" DROP COLUMN IF EXISTS "in_file_path"`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."admin_pc_line_mappings" DROP COLUMN IF EXISTS "out_file_path"`,
    );

    // Restore plain (non-partial) unique indexes on code.
    const codeUniques: Array<{ table: string; index: string }> = [
      { table: 'vehicles', index: 'IDX_VEHICLE_CODE' },
      { table: 'tests', index: 'IDX_TEST_CODE' },
      { table: 'centres', index: 'IDX_CENTRE_CODE' },
      { table: 'lines', index: 'IDX_LINE_CODE' },
      { table: 'admin_pcs', index: 'IDX_ADMIN_PC_CODE' },
      { table: 'cameras', index: 'IDX_CAMERA_CODE' },
      { table: 'payments', index: 'IDX_PAYMENT_CODE' },
    ];
    for (const u of codeUniques) {
      await queryRunner.query(`DROP INDEX IF EXISTS "master"."${u.index}"`);
      await queryRunner.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS "${u.index}" ON "master"."${u.table}" ("code")`,
      );
    }

    await queryRunner.query(`DROP INDEX IF EXISTS "master"."IDX_PT_CODE"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "master"."IDX_PT_PAYMENT_TYPE_ID"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "master"."payment_types"`);

    await queryRunner.query(
      `ALTER TABLE "master"."centres" DROP COLUMN IF EXISTS "auto_submit"`,
    );

    await queryRunner.query(
      `ALTER TABLE "master"."vehicles" DROP CONSTRAINT IF EXISTS "FK_vehicles_charge_category_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "master"."IDX_VEHICLE_CHARGE_CATEGORY_ID"`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."vehicles" DROP COLUMN IF EXISTS "charge_category_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."vehicles" DROP COLUMN IF EXISTS "vehicle_type"`,
    );

    await queryRunner.query(
      `ALTER TABLE "master"."charges" DROP CONSTRAINT IF EXISTS "FK_charges_charge_category_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "master"."IDX_CHARGE_CATEGORY_ID"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "master"."IDX_CHARGE_UNIQUE_COMBO"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "master"."IDX_CHARGE_VEHICLE_ID"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "master"."IDX_CHARGE_CENTRE_ID"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "master"."IDX_CHARGE_CHARGE_ID"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "master"."charges"`);

    await queryRunner.query(
      `DROP INDEX IF EXISTS "master"."IDX_CC_CATEGORY_ID"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "master"."charge_categories"`,
    );

    await queryRunner.query(
      `DROP INDEX IF EXISTS "master"."IDX_PAYMENT_CUSTOMER_ID"`,
    );
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
    await queryRunner.query(
      `DROP TABLE IF EXISTS "master"."admin_pc_line_mappings"`,
    );

    await queryRunner.query(
      `DROP INDEX IF EXISTS "master"."UQ_CAMERA_LINE_ID"`,
    );
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
    await queryRunner.query(
      `DROP INDEX IF EXISTS "master"."IDX_LINE_CENTRE_ID"`,
    );
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
    await queryRunner.query(
      `DROP TABLE IF EXISTS "core"."centre_api_keys" CASCADE`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "core"."audit_logs" CASCADE`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "core"."sync_run_log" CASCADE`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "core"."onboarding_status" CASCADE`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "core"."configuration" CASCADE`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "core"."UQ_ROLE_CENTRE_MAPPING_ROLE_CENTRE"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "core"."IDX_ROLE_CENTRE_MAPPING_CENTRE_ID"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "core"."IDX_ROLE_CENTRE_MAPPING_ROLE_ID"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "core"."role_centre_mappings"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "core"."IDX_ROLE_PERMISSION_ID"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "core"."IDX_ROLE_ROLE_NAME"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "core"."roles"`);
    await queryRunner.query(
      `DROP SEQUENCE IF EXISTS "core"."roles_role_id_seq"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "core"."IDX_PERMISSION_PROFILE_NAME"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "core"."permissions"`);

    await queryRunner.query(
      `DROP INDEX IF EXISTS "core"."UQ_USER_LINE_MAPPING_LINE"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "core"."UQ_USER_LINE_MAPPING_USER_LINE"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "core"."IDX_USER_LINE_MAPPING_USER_ID"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "core"."user_line_mappings"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "core"."IDX_USER_CENTER_ID"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "core"."UQ_USER_CENTER_ID"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "core"."IDX_USER_ROLE_ID"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "core"."IDX_USER_USER_CODE"`);
    await queryRunner.query(
      `ALTER TABLE "core"."users" DROP COLUMN IF EXISTS "requires_central_revalidation"`,
    );
    await queryRunner.query(
      `ALTER TABLE "core"."user_sessions" DROP COLUMN IF EXISTS "impersonated_by"`,
    );
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
  private async alignPaymentsAndAnprEvents(
    queryRunner: QueryRunner,
  ): Promise<void> {
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

    // Legacy camera-event store removed — camera reads (FTP + HTTP push) now
    // flow directly into transaction.anpr_captures. Drop the orphaned table.
    await queryRunner.query(
      `DROP TABLE IF EXISTS "opal_ivis"."anpr_events" CASCADE`,
    );
  }

  private async revertPaymentsAndAnprEvents(
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "opal_ivis"."anpr_events"`);
    await queryRunner.query(
      `ALTER TABLE "transaction"."appointments" DROP CONSTRAINT IF EXISTS "FK_appointments_payment_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction"."appointments" DROP COLUMN IF EXISTS "payment_id"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "transaction"."payments" CASCADE`,
    );
  }

  private async alignAdminPcsAndCameraMultiLine(
    queryRunner: QueryRunner,
  ): Promise<void> {
    // 1. admin_pcs: add center_id
    await queryRunner.query(
      `ALTER TABLE "master"."admin_pcs" ADD COLUMN IF NOT EXISTS "center_id" bigint`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_ADMIN_PC_CENTER_ID" ON "master"."admin_pcs" ("center_id")`,
    );
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_ADMIN_PC_CENTER_ID'
        ) THEN
          ALTER TABLE "master"."admin_pcs"
            ADD CONSTRAINT "FK_ADMIN_PC_CENTER_ID"
            FOREIGN KEY ("center_id") REFERENCES "master"."centres"("id") ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    // 2. camera_line_mappings table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "master"."camera_line_mappings" (
        "id"          bigint            NOT NULL,
        "camera_id"   bigint            NOT NULL,
        "line_id"     bigint            NOT NULL,
        "created_by"  character varying,
        "created_at"  TIMESTAMP         NOT NULL DEFAULT NOW(),
        "updated_at"  TIMESTAMP         NOT NULL DEFAULT NOW(),
        "is_deleted"  boolean           NOT NULL DEFAULT false,
        CONSTRAINT "PK_camera_line_mappings_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_camera_line_mappings_camera_id" 
          FOREIGN KEY ("camera_id") REFERENCES "master"."cameras"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_camera_line_mappings_line_id" 
          FOREIGN KEY ("line_id") REFERENCES "master"."lines"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_CAMERA_LINE_MAPPING_CAMERA_ID" ON "master"."camera_line_mappings" ("camera_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_CAMERA_LINE_MAPPING_LINE" ON "master"."camera_line_mappings" ("line_id") WHERE is_deleted = false`,
    );

    // 3. Migrate existing data from cameras table if line_id column exists
    const hasLineIdCol = await queryRunner.hasColumn('master.cameras', 'line_id');
    if (hasLineIdCol) {
      await queryRunner.query(`
        INSERT INTO "master"."camera_line_mappings" ("id", "camera_id", "line_id", "created_by", "created_at", "updated_at", "is_deleted")
        SELECT 
          (row_number() over ())::bigint + 2000000000000000000,
          "id",
          "line_id",
          "created_by",
          "created_at",
          "updated_at",
          "is_deleted"
        FROM "master"."cameras"
        WHERE "line_id" IS NOT NULL
      `);
      // Drop column and constraint
      await queryRunner.query(
        `ALTER TABLE "master"."cameras" DROP CONSTRAINT IF EXISTS "FK_cameras_line_id"`,
      );
      await queryRunner.query(
        `DROP INDEX IF EXISTS "master"."UQ_CAMERA_LINE_ID"`,
      );
      await queryRunner.query(
        `ALTER TABLE "master"."cameras" DROP COLUMN IF EXISTS "line_id"`,
      );
    }
  }

  private async revertAdminPcsAndCameraMultiLine(
    queryRunner: QueryRunner,
  ): Promise<void> {
    // Drop mapping table and restore column on cameras if mapping exists
    const hasMappingsTable = await queryRunner.hasTable('master.camera_line_mappings');
    if (hasMappingsTable) {
      await queryRunner.query(
        `ALTER TABLE "master"."cameras" ADD COLUMN IF NOT EXISTS "line_id" bigint`,
      );
      await queryRunner.query(`
        UPDATE "master"."cameras" c
        SET "line_id" = (
          SELECT "line_id" 
          FROM "master"."camera_line_mappings" m 
          WHERE m."camera_id" = c."id" AND m."is_deleted" = false
          LIMIT 1
        )
      `);
      await queryRunner.query(`DROP TABLE IF EXISTS "master"."camera_line_mappings"`);
      await queryRunner.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_CAMERA_LINE_ID" ON "master"."cameras" ("line_id")`,
      );
      await queryRunner.query(`
        ALTER TABLE "master"."cameras"
        ADD CONSTRAINT "FK_cameras_line_id"
        FOREIGN KEY ("line_id") REFERENCES "master"."lines"("id") ON DELETE NO ACTION
      `);
    }

    await queryRunner.query(
      `ALTER TABLE "master"."admin_pcs" DROP CONSTRAINT IF EXISTS "FK_ADMIN_PC_CENTER_ID"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "master"."IDX_ADMIN_PC_CENTER_ID"`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."admin_pcs" DROP COLUMN IF EXISTS "center_id"`,
    );
  }
}
