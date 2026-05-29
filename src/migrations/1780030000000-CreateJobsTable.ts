import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateJobsTable1780030000000 implements MigrationInterface {
  name = 'CreateJobsTable1780030000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "core"`);

    await queryRunner.query(`
      CREATE TABLE "core"."jobs" (
        "id"                  bigint              NOT NULL,
        "job_id"              integer             NOT NULL,
        "status"              character varying(32) NOT NULL DEFAULT 'Pending',
        "source"              character varying(32) NOT NULL,
        "customer_id"         bigint              NOT NULL,
        "vehicle_record_id"   bigint              NOT NULL,
        "anpr_capture_id"     bigint,
        "centre_id"           bigint,
        "line_id"             bigint,
        "admin_pc_id"         bigint,
        "camera_id"           bigint,
        "overall_result"      character varying(16),
        "infile_name"         character varying(256),
        "infile_path"         character varying(512),
        "outfile_name"        character varying(256),
        "outfile_path"        character varying(512),
        "started_at"          TIMESTAMP,
        "completed_at"        TIMESTAMP,
        "created_by"          character varying,
        "created_at"          TIMESTAMP           NOT NULL DEFAULT NOW(),
        "updated_at"          TIMESTAMP           NOT NULL DEFAULT NOW(),
        "is_deleted"          boolean             NOT NULL DEFAULT false,
        CONSTRAINT "PK_jobs_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_jobs_job_id" UNIQUE ("job_id"),
        CONSTRAINT "FK_jobs_customer_id"
          FOREIGN KEY ("customer_id")
          REFERENCES "core"."customers"("id")
          ON DELETE RESTRICT,
        CONSTRAINT "FK_jobs_vehicle_record_id"
          FOREIGN KEY ("vehicle_record_id")
          REFERENCES "core"."vehicle_records"("id")
          ON DELETE RESTRICT,
        CONSTRAINT "FK_jobs_centre_id"
          FOREIGN KEY ("centre_id")
          REFERENCES "master"."centres"("id")
          ON DELETE SET NULL,
        CONSTRAINT "FK_jobs_line_id"
          FOREIGN KEY ("line_id")
          REFERENCES "master"."lines"("id")
          ON DELETE SET NULL,
        CONSTRAINT "FK_jobs_admin_pc_id"
          FOREIGN KEY ("admin_pc_id")
          REFERENCES "master"."admin_pcs"("id")
          ON DELETE SET NULL,
        CONSTRAINT "FK_jobs_camera_id"
          FOREIGN KEY ("camera_id")
          REFERENCES "master"."cameras"("id")
          ON DELETE SET NULL
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_JOB_JOB_ID" ON "core"."jobs" ("job_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_JOB_STATUS_CREATED_AT" ON "core"."jobs" ("status", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_JOB_CUSTOMER_ID" ON "core"."jobs" ("customer_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_JOB_VEHICLE_RECORD_ID" ON "core"."jobs" ("vehicle_record_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_JOB_CENTRE_LINE" ON "core"."jobs" ("centre_id", "line_id")`,
    );

    const anprTable = await queryRunner.query(
      `SELECT to_regclass('core.anpr_captures') AS regclass`,
    );
    if (anprTable[0]?.regclass) {
      await queryRunner.query(`
        ALTER TABLE "core"."jobs"
        ADD CONSTRAINT "FK_jobs_anpr_capture_id"
          FOREIGN KEY ("anpr_capture_id")
          REFERENCES "core"."anpr_captures"("id")
          ON DELETE SET NULL
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "core"."jobs" DROP CONSTRAINT IF EXISTS "FK_jobs_anpr_capture_id"`,
    );
    await queryRunner.query(`DROP INDEX "core"."IDX_JOB_CENTRE_LINE"`);
    await queryRunner.query(`DROP INDEX "core"."IDX_JOB_VEHICLE_RECORD_ID"`);
    await queryRunner.query(`DROP INDEX "core"."IDX_JOB_CUSTOMER_ID"`);
    await queryRunner.query(`DROP INDEX "core"."IDX_JOB_STATUS_CREATED_AT"`);
    await queryRunner.query(`DROP INDEX "core"."IDX_JOB_JOB_ID"`);
    await queryRunner.query(`DROP TABLE "core"."jobs"`);
  }
}
