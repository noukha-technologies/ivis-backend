import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Standalone CREATE migration — drops and recreates the entire schema from scratch.
 *
 * Run with:  npm run migration:create-schema
 *
 * Guards on RUN_CREATE_SCHEMA=true so it is never executed by accident during
 * a normal `migration:run`.  The down() method is intentionally a no-op because
 * rolling back a full schema drop cannot be done automatically.
 */
export class CreateSchema1782000000000 implements MigrationInterface {
  name = 'CreateSchema1782000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (process.env.RUN_CREATE_SCHEMA !== 'true') {
      console.warn(
        '[CreateSchema] Skipped: set RUN_CREATE_SCHEMA=true or use npm run migration:create-schema',
      );
      return;
    }

    console.log('[CreateSchema] Dropping existing schemas...');
    await this.dropAll(queryRunner);

    console.log('[CreateSchema] Creating schemas...');
    await this.createSchemas(queryRunner);

    console.log('[CreateSchema] Creating core tables...');
    await this.createCoreTables(queryRunner);

    console.log('[CreateSchema] Creating master tables...');
    await this.createMasterTables(queryRunner);

    console.log('[CreateSchema] Creating transaction tables...');
    await this.createTransactionTables(queryRunner);

    console.log('[CreateSchema] Adding foreign keys...');
    await this.addForeignKeys(queryRunner);

    console.log('[CreateSchema] Done.');
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    console.warn(
      '[CreateSchema] down() is a no-op — schema was created fresh, nothing to revert.',
    );
  }

  // ─── Drop ────────────────────────────────────────────────────────────────────

  private async dropAll(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP SCHEMA IF EXISTS "transaction" CASCADE`);
    await queryRunner.query(`DROP SCHEMA IF EXISTS "master" CASCADE`);
    await queryRunner.query(`DROP SCHEMA IF EXISTS "core" CASCADE`);
  }

  // ─── Schemas ─────────────────────────────────────────────────────────────────

  private async createSchemas(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA "core"`);
    await queryRunner.query(`CREATE SCHEMA "master"`);
    await queryRunner.query(`CREATE SCHEMA "transaction"`);
  }

  // ─── Core tables ─────────────────────────────────────────────────────────────

  private async createCoreTables(queryRunner: QueryRunner): Promise<void> {
    // permissions (no FK deps)
    await queryRunner.query(`
      CREATE TABLE "core"."permissions" (
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
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_PERMISSION_PROFILE_NAME" ON "core"."permissions" ("name")`,
    );

    // sequence must exist before the table so DEFAULT nextval() resolves
    await queryRunner.query(`CREATE SEQUENCE "core"."roles_role_id_seq"`);

    // roles (FK → permissions, added after)
    await queryRunner.query(`
      CREATE TABLE "core"."roles" (
        "id"            bigint                  NOT NULL,
        "role_id"       integer                 NOT NULL DEFAULT nextval('"core"."roles_role_id_seq"'),
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
    // wire OWNED BY so the sequence is dropped with the table
    await queryRunner.query(`
      ALTER SEQUENCE "core"."roles_role_id_seq" OWNED BY "core"."roles"."role_id"
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ROLE_ROLE_NAME" ON "core"."roles" ("role_name")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ROLE_PERMISSION_ID" ON "core"."roles" ("permission_id")`,
    );

    // users (FK → roles + master.centres, added after)
    await queryRunner.query(`
      CREATE TABLE "core"."users" (
        "id"          bigint                NOT NULL,
        "user_id"     integer               NOT NULL,
        "user_code"   character varying     NOT NULL,
        "user_name"   character varying     NOT NULL,
        "email"       character varying     NOT NULL,
        "password"    character varying,
        "role_id"     bigint                NOT NULL,
        "center_id"   bigint,
        "created_by"  character varying,
        "created_at"  TIMESTAMP             NOT NULL DEFAULT NOW(),
        "updated_at"  TIMESTAMP             NOT NULL DEFAULT NOW(),
        "is_deleted"  boolean               NOT NULL DEFAULT false,
        CONSTRAINT "PK_users_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_users_user_id" UNIQUE ("user_id"),
        CONSTRAINT "UQ_users_user_code" UNIQUE ("user_code"),
        CONSTRAINT "UQ_users_email" UNIQUE ("email")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_USER_USER_ID" ON "core"."users" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_USER_USER_CODE" ON "core"."users" ("user_code")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_USER_EMAIL" ON "core"."users" ("email")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_USER_ROLE_ID" ON "core"."users" ("role_id")`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_USER_CENTER_ID" ON "core"."users" ("center_id")
      WHERE "is_deleted" = false AND "center_id" IS NOT NULL
    `);

    // user_sessions (FK → users)
    await queryRunner.query(`
      CREATE TABLE "core"."user_sessions" (
        "id"                  bigint      NOT NULL,
        "user_id"             bigint      NOT NULL,
        "access_token_jti"    character varying NOT NULL,
        "refresh_token_jti"   character varying NOT NULL,
        "refresh_token"       character varying NOT NULL,
        "is_active"           boolean     NOT NULL DEFAULT true,
        "expired_at"          TIMESTAMP   NOT NULL,
        "last_refreshed_at"   TIMESTAMP,
        "metadata"            jsonb,
        "created_by"          character varying,
        "created_at"          TIMESTAMP   NOT NULL DEFAULT NOW(),
        "updated_at"          TIMESTAMP   NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_user_sessions_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_user_sessions_user_id"
          FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_USER_SESSIONS_USER_JTI" ON "core"."user_sessions" ("user_id", "access_token_jti")`,
    );

    // user_line_mappings (FK → users + master.lines, added after)
    await queryRunner.query(`
      CREATE TABLE "core"."user_line_mappings" (
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
      `CREATE INDEX "IDX_USER_LINE_MAPPING_USER_ID" ON "core"."user_line_mappings" ("user_id")`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_USER_LINE_MAPPING_USER_LINE"
      ON "core"."user_line_mappings" ("user_id", "line_id")
      WHERE "is_deleted" = false
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_USER_LINE_MAPPING_LINE"
      ON "core"."user_line_mappings" ("line_id")
      WHERE "is_deleted" = false
    `);
  }

  // ─── Master tables ────────────────────────────────────────────────────────────

  private async createMasterTables(queryRunner: QueryRunner): Promise<void> {
    // vehicles (no FK deps)
    await queryRunner.query(`
      CREATE TABLE "master"."vehicles" (
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
      `CREATE UNIQUE INDEX "IDX_VEHICLE_VEHICLE_ID" ON "master"."vehicles" ("vehicle_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_VEHICLE_CODE" ON "master"."vehicles" ("code")`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_VEHICLE_VIN_NO"
        ON "master"."vehicles" ("vin_no")
        WHERE "is_deleted" = false AND "vin_no" IS NOT NULL
    `);

    // tests (no FK deps)
    await queryRunner.query(`
      CREATE TABLE "master"."tests" (
        "id"          bigint                NOT NULL,
        "test_id"     integer               NOT NULL,
        "name"        character varying     NOT NULL,
        "code"        character varying     NOT NULL,
        "status"      character varying     NOT NULL DEFAULT 'Active',
        "created_by"  character varying,
        "created_at"  TIMESTAMP             NOT NULL DEFAULT NOW(),
        "updated_at"  TIMESTAMP             NOT NULL DEFAULT NOW(),
        "is_deleted"  boolean               NOT NULL DEFAULT false,
        CONSTRAINT "PK_tests_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_tests_test_id" UNIQUE ("test_id"),
        CONSTRAINT "UQ_tests_code" UNIQUE ("code")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_TEST_TEST_ID" ON "master"."tests" ("test_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_TEST_CODE" ON "master"."tests" ("code")`,
    );

    // centres (no FK deps)
    await queryRunner.query(`
      CREATE TABLE "master"."centres" (
        "id"          bigint                NOT NULL,
        "centre_id"   integer               NOT NULL,
        "name"        character varying     NOT NULL,
        "code"        character varying     NOT NULL,
        "description" character varying,
        "status"      character varying     NOT NULL DEFAULT 'Active',
        "created_by"  character varying,
        "created_at"  TIMESTAMP             NOT NULL DEFAULT NOW(),
        "updated_at"  TIMESTAMP             NOT NULL DEFAULT NOW(),
        "is_deleted"  boolean               NOT NULL DEFAULT false,
        CONSTRAINT "PK_centres_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_centres_centre_id" UNIQUE ("centre_id"),
        CONSTRAINT "UQ_centres_code" UNIQUE ("code")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_CENTRE_CENTRE_ID" ON "master"."centres" ("centre_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_CENTRE_CODE" ON "master"."centres" ("code")`,
    );

    // lines (FK → centres)
    await queryRunner.query(`
      CREATE TABLE "master"."lines" (
        "id"            bigint            NOT NULL,
        "line_id"       integer           NOT NULL,
        "name"          character varying NOT NULL,
        "code"          character varying NOT NULL,
        "display_order" integer           NOT NULL DEFAULT 1,
        "description"   character varying,
        "status"        character varying NOT NULL DEFAULT 'Active',
        "centre_id"     bigint            NOT NULL,
        "created_by"    character varying,
        "created_at"    TIMESTAMP         NOT NULL DEFAULT NOW(),
        "updated_at"    TIMESTAMP         NOT NULL DEFAULT NOW(),
        "is_deleted"    boolean           NOT NULL DEFAULT false,
        CONSTRAINT "PK_lines_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_lines_line_id" UNIQUE ("line_id"),
        CONSTRAINT "UQ_lines_code" UNIQUE ("code"),
        CONSTRAINT "FK_lines_centre_id"
          FOREIGN KEY ("centre_id") REFERENCES "master"."centres"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_LINE_LINE_ID" ON "master"."lines" ("line_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_LINE_CODE" ON "master"."lines" ("code")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_LINE_CENTRE_ID" ON "master"."lines" ("centre_id")`,
    );

    // admin_pcs (no FK deps; line FK via admin_pc_line_mappings)
    await queryRunner.query(`
      CREATE TABLE "master"."admin_pcs" (
        "id"            bigint                NOT NULL,
        "admin_pc_id"   integer               NOT NULL,
        "name"          character varying     NOT NULL,
        "code"          character varying     NOT NULL,
        "ip_address"    character varying     NOT NULL,
        "description"   character varying,
        "status"        character varying     NOT NULL DEFAULT 'Active',
        "created_by"    character varying,
        "created_at"    TIMESTAMP             NOT NULL DEFAULT NOW(),
        "updated_at"    TIMESTAMP             NOT NULL DEFAULT NOW(),
        "is_deleted"    boolean               NOT NULL DEFAULT false,
        CONSTRAINT "PK_admin_pcs_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_admin_pcs_admin_pc_id" UNIQUE ("admin_pc_id"),
        CONSTRAINT "UQ_admin_pcs_code" UNIQUE ("code")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ADMIN_PC_ADMIN_PC_ID" ON "master"."admin_pcs" ("admin_pc_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ADMIN_PC_CODE" ON "master"."admin_pcs" ("code")`,
    );

    // cameras (FK → lines)
    await queryRunner.query(`
      CREATE TABLE "master"."cameras" (
        "id"          bigint            NOT NULL,
        "camera_id"   integer           NOT NULL,
        "name"        character varying NOT NULL,
        "code"        character varying NOT NULL,
        "type"        character varying NOT NULL,
        "line_id"     bigint            NOT NULL,
        "description" character varying,
        "status"      character varying NOT NULL DEFAULT 'Active',
        "created_by"  character varying,
        "created_at"  TIMESTAMP         NOT NULL DEFAULT NOW(),
        "updated_at"  TIMESTAMP         NOT NULL DEFAULT NOW(),
        "is_deleted"  boolean           NOT NULL DEFAULT false,
        CONSTRAINT "PK_cameras_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_cameras_camera_id" UNIQUE ("camera_id"),
        CONSTRAINT "UQ_cameras_code" UNIQUE ("code"),
        CONSTRAINT "FK_cameras_line_id"
          FOREIGN KEY ("line_id") REFERENCES "master"."lines"("id") ON DELETE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_CAMERA_CAMERA_ID" ON "master"."cameras" ("camera_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_CAMERA_CODE" ON "master"."cameras" ("code")`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_CAMERA_LINE_ID" ON "master"."cameras" ("line_id")
      WHERE "is_deleted" = false
    `);

    // admin_pc_line_mappings (FK → admin_pcs + lines)
    await queryRunner.query(`
      CREATE TABLE "master"."admin_pc_line_mappings" (
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
      `CREATE INDEX "IDX_ADMIN_PC_LINE_MAPPING_ADMIN_PC_ID" ON "master"."admin_pc_line_mappings" ("admin_pc_id")`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_ADMIN_PC_LINE_MAPPING_ADMIN_PC_LINE"
      ON "master"."admin_pc_line_mappings" ("admin_pc_id", "line_id")
      WHERE "is_deleted" = false
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_ADMIN_PC_LINE_MAPPING_LINE"
      ON "master"."admin_pc_line_mappings" ("line_id")
      WHERE "is_deleted" = false
    `);

    // payments (FK → transaction.customers, added after)
    await queryRunner.query(`
      CREATE TABLE "master"."payments" (
        "id"            bigint              NOT NULL,
        "payment_id"    integer             NOT NULL,
        "code"          character varying   NOT NULL,
        "status"        character varying   NOT NULL DEFAULT 'Active',
        "customer_id"   bigint,
        "payment_mode"  character varying(64),
        "type"          character varying(64),
        "amount"        numeric(12,2)       NOT NULL DEFAULT 0,
        "created_by"    character varying,
        "created_at"    TIMESTAMP           NOT NULL DEFAULT NOW(),
        "updated_at"    TIMESTAMP           NOT NULL DEFAULT NOW(),
        "is_deleted"    boolean             NOT NULL DEFAULT false,
        CONSTRAINT "PK_payments_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_payments_payment_id" UNIQUE ("payment_id"),
        CONSTRAINT "UQ_payments_code" UNIQUE ("code")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_PAYMENT_PAYMENT_ID" ON "master"."payments" ("payment_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_PAYMENT_CODE" ON "master"."payments" ("code")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_PAYMENT_CUSTOMER_ID" ON "master"."payments" ("customer_id")`,
    );
  }

  // ─── Transaction tables ───────────────────────────────────────────────────────

  private async createTransactionTables(
    queryRunner: QueryRunner,
  ): Promise<void> {
    // vehicle_records (FK → master.vehicles)
    await queryRunner.query(`
      CREATE TABLE "transaction"."vehicle_records" (
        "id"                bigint                NOT NULL,
        "vehicle_record_id" integer               NOT NULL,
        "plate_number"      character varying(32) NOT NULL,
        "chassis_no"        character varying(64),
        "vehicle_make"      character varying(64),
        "vehicle_model"     character varying(64),
        "vehicle_type"      character varying(64),
        "plate_color"       character varying(64),
        "vehicle_color"     character varying(64),
        "vehicle_master_id" bigint,
        "created_by"        character varying,
        "created_at"        TIMESTAMP             NOT NULL DEFAULT NOW(),
        "updated_at"        TIMESTAMP             NOT NULL DEFAULT NOW(),
        "is_deleted"        boolean               NOT NULL DEFAULT false,
        CONSTRAINT "PK_vehicle_records_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_vehicle_records_vehicle_record_id" UNIQUE ("vehicle_record_id"),
        CONSTRAINT "FK_vehicle_records_vehicle_master_id"
          FOREIGN KEY ("vehicle_master_id") REFERENCES "master"."vehicles"("id") ON DELETE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_VEHICLE_RECORD_VEHICLE_RECORD_ID" ON "transaction"."vehicle_records" ("vehicle_record_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_VEHICLE_RECORD_CHASSIS_NO" ON "transaction"."vehicle_records" ("chassis_no")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_VEHICLE_RECORD_VEHICLE_MASTER_ID" ON "transaction"."vehicle_records" ("vehicle_master_id")`,
    );

    // customers (FK → vehicle_records self-referencing primary_vehicle_record_id)
    await queryRunner.query(`
      CREATE TABLE "transaction"."customers" (
        "id"                        bigint                NOT NULL,
        "customer_id"               integer               NOT NULL,
        "name"                      character varying(128) NOT NULL,
        "phone"                     character varying(32) NOT NULL,
        "owner_name"                character varying(128),
        "id_number"                 character varying(64),
        "chassis_no"                character varying(64),
        "mulkiya_id"                character varying(64),
        "primary_vehicle_record_id" bigint,
        "created_by"                character varying,
        "created_at"                TIMESTAMP             NOT NULL DEFAULT NOW(),
        "updated_at"                TIMESTAMP             NOT NULL DEFAULT NOW(),
        "is_deleted"                boolean               NOT NULL DEFAULT false,
        CONSTRAINT "PK_customers_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_customers_customer_id" UNIQUE ("customer_id"),
        CONSTRAINT "FK_customers_primary_vehicle_record_id"
          FOREIGN KEY ("primary_vehicle_record_id") REFERENCES "transaction"."vehicle_records"("id") ON DELETE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_CUSTOMER_CUSTOMER_ID" ON "transaction"."customers" ("customer_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_CUSTOMER_PHONE" ON "transaction"."customers" ("phone")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_CUSTOMER_ID_NUMBER" ON "transaction"."customers" ("id_number")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_CUSTOMER_CHASSIS_NO" ON "transaction"."customers" ("chassis_no")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_CUSTOMER_MULKIYA_ID" ON "transaction"."customers" ("mulkiya_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_CUSTOMER_PRIMARY_VEHICLE_RECORD_ID" ON "transaction"."customers" ("primary_vehicle_record_id")`,
    );

    // anpr_captures (FK → master.cameras)
    await queryRunner.query(`
      CREATE TABLE "transaction"."anpr_captures" (
        "id"                  bigint                NOT NULL,
        "anpr_capture_id"     integer               NOT NULL,
        "plate_number"        character varying(32) NOT NULL,
        "normalized_plate"    character varying(32),
        "plate_confidence"    numeric(5,2),
        "capture_time"        TIMESTAMP             NOT NULL,
        "camera_id"           bigint                NOT NULL,
        "lane"                character varying(32),
        "direction"           character varying(32),
        "country_code"        character varying(8),
        "plate_color"         character varying(32),
        "vehicle_type"        character varying(64),
        "vehicle_color"       character varying(64),
        "image_url"           character varying,
        "verification_status" character varying     NOT NULL DEFAULT 'Pending',
        "raw_payload"         jsonb,
        "created_by"          character varying,
        "created_at"          TIMESTAMP             NOT NULL DEFAULT NOW(),
        "updated_at"          TIMESTAMP             NOT NULL DEFAULT NOW(),
        "is_deleted"          boolean               NOT NULL DEFAULT false,
        CONSTRAINT "PK_anpr_captures_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_anpr_captures_anpr_capture_id" UNIQUE ("anpr_capture_id"),
        CONSTRAINT "FK_anpr_captures_camera_id"
          FOREIGN KEY ("camera_id") REFERENCES "master"."cameras"("id") ON DELETE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ANPR_CAPTURE_ANPR_CAPTURE_ID" ON "transaction"."anpr_captures" ("anpr_capture_id")`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_ANPR_CAPTURE_CAMERA_PLATE_TIME"
      ON "transaction"."anpr_captures" ("camera_id", "plate_number", "capture_time")
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_ANPR_CAPTURE_CAMERA_TIME" ON "transaction"."anpr_captures" ("camera_id", "capture_time")`,
    );

    // rop_verifications (FK → anpr_captures)
    await queryRunner.query(`
      CREATE TABLE "transaction"."rop_verifications" (
        "id"                    bigint                NOT NULL,
        "rop_verification_id"   integer               NOT NULL,
        "anpr_capture_id"       bigint                NOT NULL,
        "owner_name"            character varying(128),
        "vehicle_make"          character varying(64),
        "vehicle_model"         character varying(64),
        "reg_no"                character varying(32),
        "chassis_no"            character varying(64),
        "insurance"             character varying(128),
        "reg_expiry"            date,
        "fetch_status"          character varying(32) NOT NULL DEFAULT 'Not Fetched',
        "created_by"            character varying,
        "created_at"            TIMESTAMP             NOT NULL DEFAULT NOW(),
        "updated_at"            TIMESTAMP             NOT NULL DEFAULT NOW(),
        "is_deleted"            boolean               NOT NULL DEFAULT false,
        CONSTRAINT "PK_rop_verifications_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_rop_verifications_rop_verification_id" UNIQUE ("rop_verification_id"),
        CONSTRAINT "FK_rop_verifications_anpr_capture_id"
          FOREIGN KEY ("anpr_capture_id") REFERENCES "transaction"."anpr_captures"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ROP_VERIFICATION_ROP_VERIFICATION_ID" ON "transaction"."rop_verifications" ("rop_verification_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ROP_VERIFICATION_FETCH_STATUS_CREATED_AT" ON "transaction"."rop_verifications" ("fetch_status", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ROP_VERIFICATION_ANPR_CAPTURE_ID" ON "transaction"."rop_verifications" ("anpr_capture_id")`,
    );

    // jobs (FK → customers, vehicle_records, centres, lines, admin_pcs, cameras, anpr_captures)
    await queryRunner.query(`
      CREATE TABLE "transaction"."jobs" (
        "id"                bigint                NOT NULL,
        "job_id"            integer               NOT NULL,
        "status"            character varying(32) NOT NULL DEFAULT 'Pending',
        "source"            character varying(32) NOT NULL,
        "customer_id"       bigint                NOT NULL,
        "vehicle_record_id" bigint                NOT NULL,
        "anpr_capture_id"   bigint,
        "centre_id"         bigint,
        "line_id"           bigint,
        "admin_pc_id"       bigint,
        "camera_id"         bigint,
        "overall_result"    character varying(16),
        "infile_name"       character varying(256),
        "infile_path"       character varying(512),
        "outfile_name"      character varying(256),
        "outfile_path"      character varying(512),
        "started_at"        TIMESTAMP,
        "completed_at"      TIMESTAMP,
        "created_by"        character varying,
        "created_at"        TIMESTAMP             NOT NULL DEFAULT NOW(),
        "updated_at"        TIMESTAMP             NOT NULL DEFAULT NOW(),
        "is_deleted"        boolean               NOT NULL DEFAULT false,
        CONSTRAINT "PK_jobs_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_jobs_job_id" UNIQUE ("job_id"),
        CONSTRAINT "FK_jobs_customer_id"
          FOREIGN KEY ("customer_id") REFERENCES "transaction"."customers"("id") ON DELETE NO ACTION,
        CONSTRAINT "FK_jobs_vehicle_record_id"
          FOREIGN KEY ("vehicle_record_id") REFERENCES "transaction"."vehicle_records"("id") ON DELETE NO ACTION,
        CONSTRAINT "FK_jobs_anpr_capture_id"
          FOREIGN KEY ("anpr_capture_id") REFERENCES "transaction"."anpr_captures"("id") ON DELETE NO ACTION,
        CONSTRAINT "FK_jobs_centre_id"
          FOREIGN KEY ("centre_id") REFERENCES "master"."centres"("id") ON DELETE NO ACTION,
        CONSTRAINT "FK_jobs_line_id"
          FOREIGN KEY ("line_id") REFERENCES "master"."lines"("id") ON DELETE NO ACTION,
        CONSTRAINT "FK_jobs_admin_pc_id"
          FOREIGN KEY ("admin_pc_id") REFERENCES "master"."admin_pcs"("id") ON DELETE NO ACTION,
        CONSTRAINT "FK_jobs_camera_id"
          FOREIGN KEY ("camera_id") REFERENCES "master"."cameras"("id") ON DELETE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_JOB_JOB_ID" ON "transaction"."jobs" ("job_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_JOB_STATUS_CREATED_AT" ON "transaction"."jobs" ("status", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_JOB_CUSTOMER_ID" ON "transaction"."jobs" ("customer_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_JOB_VEHICLE_RECORD_ID" ON "transaction"."jobs" ("vehicle_record_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_JOB_CENTRE_LINE" ON "transaction"."jobs" ("centre_id", "line_id")`,
    );

    // appointments (FK → anpr_captures, customers, vehicle_records, centres, lines)
    await queryRunner.query(`
      CREATE TABLE "transaction"."appointments" (
        "id"                bigint                  NOT NULL,
        "appointment_id"    integer                 NOT NULL,
        "anpr_capture_id"   bigint,
        "customer_id"       bigint,
        "vehicle_record_id" bigint,
        "centre_id"         bigint,
        "line_id"           bigint,
        "plate_number"      character varying(32),
        "customer_name"     character varying(128),
        "customer_phone"    character varying(32),
        "id_number"         character varying(64),
        "appointment_at"    TIMESTAMP               NOT NULL,
        "status"            character varying(32)   NOT NULL DEFAULT 'Scheduled',
        "payment_mode"      character varying(64)   NOT NULL,
        "type"              character varying(64)   NOT NULL,
        "notes"             character varying(512),
        "created_by"        character varying,
        "created_at"        TIMESTAMP               NOT NULL DEFAULT NOW(),
        "updated_at"        TIMESTAMP               NOT NULL DEFAULT NOW(),
        "is_deleted"        boolean                 NOT NULL DEFAULT false,
        CONSTRAINT "PK_appointments_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_appointments_appointment_id" UNIQUE ("appointment_id"),
        CONSTRAINT "FK_appointments_anpr_capture_id"
          FOREIGN KEY ("anpr_capture_id") REFERENCES "transaction"."anpr_captures"("id") ON DELETE NO ACTION,
        CONSTRAINT "FK_appointments_customer_id"
          FOREIGN KEY ("customer_id") REFERENCES "transaction"."customers"("id") ON DELETE NO ACTION,
        CONSTRAINT "FK_appointments_vehicle_record_id"
          FOREIGN KEY ("vehicle_record_id") REFERENCES "transaction"."vehicle_records"("id") ON DELETE NO ACTION,
        CONSTRAINT "FK_appointments_centre_id"
          FOREIGN KEY ("centre_id") REFERENCES "master"."centres"("id") ON DELETE NO ACTION,
        CONSTRAINT "FK_appointments_line_id"
          FOREIGN KEY ("line_id") REFERENCES "master"."lines"("id") ON DELETE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_APPOINTMENT_APPOINTMENT_ID" ON "transaction"."appointments" ("appointment_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_APPOINTMENT_ANPR_CAPTURE_ID" ON "transaction"."appointments" ("anpr_capture_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_APPOINTMENT_CUSTOMER_ID" ON "transaction"."appointments" ("customer_id")`,
    );

    // payment_transactions (FK → many tables)
    await queryRunner.query(`
      CREATE TABLE "transaction"."payment_transactions" (
        "id"                      bigint                NOT NULL,
        "payment_transaction_id"  integer               NOT NULL,
        "appointment_id"          bigint,
        "customer_id"             bigint                NOT NULL,
        "vehicle_record_id"       bigint                NOT NULL,
        "job_id"                  bigint,
        "anpr_capture_id"         bigint,
        "centre_id"               bigint,
        "line_id"                 bigint,
        "admin_pc_id"             bigint,
        "camera_id"               bigint,
        "payment_type"            character varying(32) NOT NULL,
        "status"                  character varying(32) NOT NULL DEFAULT 'Pending',
        "charges"                 numeric(12,2)         NOT NULL DEFAULT 0,
        "vat"                     numeric(12,2)         NOT NULL DEFAULT 0,
        "grand_total"             numeric(12,2)         NOT NULL DEFAULT 0,
        "pay_date"                TIMESTAMP,
        "created_by"              character varying,
        "created_at"              TIMESTAMP             NOT NULL DEFAULT NOW(),
        "updated_at"              TIMESTAMP             NOT NULL DEFAULT NOW(),
        "is_deleted"              boolean               NOT NULL DEFAULT false,
        CONSTRAINT "PK_payment_transactions_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_payment_transactions_payment_transaction_id" UNIQUE ("payment_transaction_id"),
        CONSTRAINT "FK_payment_transactions_appointment_id"
          FOREIGN KEY ("appointment_id") REFERENCES "transaction"."appointments"("id") ON DELETE NO ACTION,
        CONSTRAINT "FK_payment_transactions_customer_id"
          FOREIGN KEY ("customer_id") REFERENCES "transaction"."customers"("id") ON DELETE NO ACTION,
        CONSTRAINT "FK_payment_transactions_vehicle_record_id"
          FOREIGN KEY ("vehicle_record_id") REFERENCES "transaction"."vehicle_records"("id") ON DELETE NO ACTION,
        CONSTRAINT "FK_payment_transactions_job_id"
          FOREIGN KEY ("job_id") REFERENCES "transaction"."jobs"("id") ON DELETE NO ACTION,
        CONSTRAINT "FK_payment_transactions_anpr_capture_id"
          FOREIGN KEY ("anpr_capture_id") REFERENCES "transaction"."anpr_captures"("id") ON DELETE NO ACTION,
        CONSTRAINT "FK_payment_transactions_centre_id"
          FOREIGN KEY ("centre_id") REFERENCES "master"."centres"("id") ON DELETE NO ACTION,
        CONSTRAINT "FK_payment_transactions_line_id"
          FOREIGN KEY ("line_id") REFERENCES "master"."lines"("id") ON DELETE NO ACTION,
        CONSTRAINT "FK_payment_transactions_admin_pc_id"
          FOREIGN KEY ("admin_pc_id") REFERENCES "master"."admin_pcs"("id") ON DELETE NO ACTION,
        CONSTRAINT "FK_payment_transactions_camera_id"
          FOREIGN KEY ("camera_id") REFERENCES "master"."cameras"("id") ON DELETE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_PAYMENT_TRANSACTION_PAYMENT_TRANSACTION_ID" ON "transaction"."payment_transactions" ("payment_transaction_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_PAYMENT_TRANSACTION_CUSTOMER_ID" ON "transaction"."payment_transactions" ("customer_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_PAYMENT_TRANSACTION_STATUS" ON "transaction"."payment_transactions" ("status")`,
    );
  }

  // ─── Cross-schema foreign keys ────────────────────────────────────────────────

  private async addForeignKeys(queryRunner: QueryRunner): Promise<void> {
    // core.roles → core.permissions
    await queryRunner.query(`
      ALTER TABLE "core"."roles"
      ADD CONSTRAINT "FK_roles_permission_id"
        FOREIGN KEY ("permission_id") REFERENCES "core"."permissions"("id") ON DELETE NO ACTION
    `);

    // core.users → core.roles
    await queryRunner.query(`
      ALTER TABLE "core"."users"
      ADD CONSTRAINT "FK_users_role_id"
        FOREIGN KEY ("role_id") REFERENCES "core"."roles"("id") ON DELETE NO ACTION
    `);

    // core.users → master.centres
    await queryRunner.query(`
      ALTER TABLE "core"."users"
      ADD CONSTRAINT "FK_users_center_id"
        FOREIGN KEY ("center_id") REFERENCES "master"."centres"("id") ON DELETE NO ACTION
    `);

    // core.user_line_mappings → core.users + master.lines
    await queryRunner.query(`
      ALTER TABLE "core"."user_line_mappings"
      ADD CONSTRAINT "FK_user_line_mappings_user_id"
        FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "core"."user_line_mappings"
      ADD CONSTRAINT "FK_user_line_mappings_line_id"
        FOREIGN KEY ("line_id") REFERENCES "master"."lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE
    `);

    // master.payments → transaction.customers
    await queryRunner.query(`
      ALTER TABLE "master"."payments"
      ADD CONSTRAINT "FK_payments_customer_id"
        FOREIGN KEY ("customer_id") REFERENCES "transaction"."customers"("id") ON DELETE NO ACTION
    `);
  }
}
