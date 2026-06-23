import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAnprSchema1783010000000 implements MigrationInterface {
  name = 'CreateAnprSchema1783010000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
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

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_anpr_events_plate_capture"
      ON "opal_ivis"."anpr_events" ("plate_number", "capture_time")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_plate_number"
      ON "opal_ivis"."anpr_events" ("plate_number")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_capture_time"
      ON "opal_ivis"."anpr_events" ("capture_time")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_camera_ip"
      ON "opal_ivis"."anpr_events" ("camera_ip")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_camera_mac"
      ON "opal_ivis"."anpr_events" ("camera_mac")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "opal_ivis"."anpr_events"`);
    await queryRunner.query(`DROP SCHEMA IF EXISTS "opal_ivis"`);
  }
}
