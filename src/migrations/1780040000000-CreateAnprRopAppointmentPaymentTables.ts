import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAnprRopAppointmentPaymentTables1780040000000
  implements MigrationInterface
{
  name = 'CreateAnprRopAppointmentPaymentTables1780040000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "core"`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "core"."anpr_captures" (
        "id"                  bigint              NOT NULL,
        "anpr_capture_id"     integer             NOT NULL,
        "plate_number"        character varying(32) NOT NULL,
        "normalized_plate"      character varying(32),
        "plate_confidence"    numeric(5,2),
        "capture_time"        TIMESTAMP           NOT NULL,
        "camera_id"           bigint              NOT NULL,
        "lane"                character varying(32),
        "direction"           character varying(32),
        "country_code"        character varying(8),
        "plate_color"         character varying(32),
        "vehicle_type"        character varying(64),
        "vehicle_color"       character varying(64),
        "image_url"           character varying,
        "verification_status" character varying   NOT NULL DEFAULT 'Pending',
        "raw_payload"         jsonb,
        "created_by"          character varying,
        "created_at"          TIMESTAMP           NOT NULL DEFAULT NOW(),
        "updated_at"          TIMESTAMP           NOT NULL DEFAULT NOW(),
        "is_deleted"          boolean             NOT NULL DEFAULT false,
        CONSTRAINT "PK_anpr_captures_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_anpr_captures_anpr_capture_id" UNIQUE ("anpr_capture_id"),
        CONSTRAINT "FK_anpr_captures_camera_id"
          FOREIGN KEY ("camera_id")
          REFERENCES "master"."cameras"("id")
          ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_ANPR_CAPTURE_ANPR_CAPTURE_ID"
        ON "core"."anpr_captures" ("anpr_capture_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_ANPR_CAPTURE_PLATE_TIME"
        ON "core"."anpr_captures" ("plate_number", "capture_time")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "core"."rop_verifications" (
        "id"                    bigint              NOT NULL,
        "rop_verification_id"   integer             NOT NULL,
        "anpr_capture_id"       bigint              NOT NULL,
        "owner_name"            character varying(128),
        "vehicle_make"          character varying(64),
        "vehicle_model"         character varying(64),
        "reg_no"                character varying(32),
        "chassis_no"            character varying(64),
        "insurance"             character varying(128),
        "reg_expiry"            date,
        "fetch_status"          character varying(32) NOT NULL DEFAULT 'Not Fetched',
        "created_by"            character varying,
        "created_at"            TIMESTAMP           NOT NULL DEFAULT NOW(),
        "updated_at"            TIMESTAMP           NOT NULL DEFAULT NOW(),
        "is_deleted"            boolean             NOT NULL DEFAULT false,
        CONSTRAINT "PK_rop_verifications_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_rop_verifications_rop_verification_id" UNIQUE ("rop_verification_id"),
        CONSTRAINT "FK_rop_verifications_anpr_capture_id"
          FOREIGN KEY ("anpr_capture_id")
          REFERENCES "core"."anpr_captures"("id")
          ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_ROP_VERIFICATION_ROP_VERIFICATION_ID"
        ON "core"."rop_verifications" ("rop_verification_id")
    `);

    await queryRunner.query(`
      ALTER TABLE "core"."jobs"
      DROP CONSTRAINT IF EXISTS "FK_jobs_anpr_capture_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "core"."jobs"
      ADD CONSTRAINT "FK_jobs_anpr_capture_id"
        FOREIGN KEY ("anpr_capture_id")
        REFERENCES "core"."anpr_captures"("id")
        ON DELETE SET NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "core"."appointments" (
        "id"                  bigint              NOT NULL,
        "appointment_id"      integer             NOT NULL,
        "anpr_capture_id"     bigint,
        "customer_id"         bigint,
        "vehicle_record_id"   bigint,
        "centre_id"           bigint,
        "line_id"             bigint,
        "plate_number"        character varying(32),
        "customer_name"       character varying(128),
        "customer_phone"      character varying(32),
        "id_number"           character varying(64),
        "appointment_at"      TIMESTAMP           NOT NULL,
        "status"              character varying(32) NOT NULL DEFAULT 'Scheduled',
        "notes"               character varying(512),
        "created_by"          character varying,
        "created_at"          TIMESTAMP           NOT NULL DEFAULT NOW(),
        "updated_at"          TIMESTAMP           NOT NULL DEFAULT NOW(),
        "is_deleted"          boolean             NOT NULL DEFAULT false,
        CONSTRAINT "PK_appointments_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_appointments_appointment_id" UNIQUE ("appointment_id"),
        CONSTRAINT "FK_appointments_anpr_capture_id"
          FOREIGN KEY ("anpr_capture_id")
          REFERENCES "core"."anpr_captures"("id")
          ON DELETE SET NULL,
        CONSTRAINT "FK_appointments_customer_id"
          FOREIGN KEY ("customer_id")
          REFERENCES "core"."customers"("id")
          ON DELETE SET NULL,
        CONSTRAINT "FK_appointments_vehicle_record_id"
          FOREIGN KEY ("vehicle_record_id")
          REFERENCES "core"."vehicle_records"("id")
          ON DELETE SET NULL,
        CONSTRAINT "FK_appointments_centre_id"
          FOREIGN KEY ("centre_id")
          REFERENCES "master"."centres"("id")
          ON DELETE SET NULL,
        CONSTRAINT "FK_appointments_line_id"
          FOREIGN KEY ("line_id")
          REFERENCES "master"."lines"("id")
          ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_APPOINTMENT_APPOINTMENT_ID"
        ON "core"."appointments" ("appointment_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "core"."payment_transactions" (
        "id"                      bigint              NOT NULL,
        "payment_transaction_id"  integer             NOT NULL,
        "appointment_id"          bigint,
        "customer_id"             bigint              NOT NULL,
        "vehicle_record_id"       bigint              NOT NULL,
        "job_id"                  bigint,
        "anpr_capture_id"         bigint,
        "centre_id"               bigint,
        "line_id"                 bigint,
        "admin_pc_id"             bigint,
        "camera_id"               bigint,
        "payment_type"            character varying(32) NOT NULL,
        "status"                  character varying(32) NOT NULL DEFAULT 'Pending',
        "charges"                 numeric(12,2)       NOT NULL DEFAULT 0,
        "vat"                     numeric(12,2)       NOT NULL DEFAULT 0,
        "grand_total"             numeric(12,2)       NOT NULL DEFAULT 0,
        "pay_date"                TIMESTAMP,
        "created_by"              character varying,
        "created_at"              TIMESTAMP           NOT NULL DEFAULT NOW(),
        "updated_at"              TIMESTAMP           NOT NULL DEFAULT NOW(),
        "is_deleted"              boolean             NOT NULL DEFAULT false,
        CONSTRAINT "PK_payment_transactions_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_payment_transactions_payment_transaction_id" UNIQUE ("payment_transaction_id"),
        CONSTRAINT "FK_payment_transactions_appointment_id"
          FOREIGN KEY ("appointment_id")
          REFERENCES "core"."appointments"("id")
          ON DELETE SET NULL,
        CONSTRAINT "FK_payment_transactions_customer_id"
          FOREIGN KEY ("customer_id")
          REFERENCES "core"."customers"("id")
          ON DELETE RESTRICT,
        CONSTRAINT "FK_payment_transactions_vehicle_record_id"
          FOREIGN KEY ("vehicle_record_id")
          REFERENCES "core"."vehicle_records"("id")
          ON DELETE RESTRICT,
        CONSTRAINT "FK_payment_transactions_job_id"
          FOREIGN KEY ("job_id")
          REFERENCES "core"."jobs"("id")
          ON DELETE SET NULL,
        CONSTRAINT "FK_payment_transactions_anpr_capture_id"
          FOREIGN KEY ("anpr_capture_id")
          REFERENCES "core"."anpr_captures"("id")
          ON DELETE SET NULL,
        CONSTRAINT "FK_payment_transactions_centre_id"
          FOREIGN KEY ("centre_id")
          REFERENCES "master"."centres"("id")
          ON DELETE SET NULL,
        CONSTRAINT "FK_payment_transactions_line_id"
          FOREIGN KEY ("line_id")
          REFERENCES "master"."lines"("id")
          ON DELETE SET NULL,
        CONSTRAINT "FK_payment_transactions_admin_pc_id"
          FOREIGN KEY ("admin_pc_id")
          REFERENCES "master"."admin_pcs"("id")
          ON DELETE SET NULL,
        CONSTRAINT "FK_payment_transactions_camera_id"
          FOREIGN KEY ("camera_id")
          REFERENCES "master"."cameras"("id")
          ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_PAYMENT_TRANSACTION_PAYMENT_TRANSACTION_ID"
        ON "core"."payment_transactions" ("payment_transaction_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "core"."payment_transactions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "core"."appointments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "core"."rop_verifications"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "core"."anpr_captures"`);
  }
}
