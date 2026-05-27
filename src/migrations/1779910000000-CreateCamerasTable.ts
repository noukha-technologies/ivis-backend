import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCamerasTable1779910000000 implements MigrationInterface {
  name = 'CreateCamerasTable1779910000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "master"."cameras" (
        "id"            bigint              NOT NULL,
        "camera_id"     integer             NOT NULL,
        "name"          character varying   NOT NULL,
        "code"          character varying   NOT NULL,
        "type"          character varying   NOT NULL,
        "line_id"       bigint              NOT NULL,
        "description"   character varying,
        "status"        character varying   NOT NULL DEFAULT 'Active',
        "created_at"    TIMESTAMP           NOT NULL DEFAULT NOW(),
        "created_by"    character varying,
        "updated_at"    TIMESTAMP           NOT NULL DEFAULT NOW(),
        "is_deleted"    boolean             NOT NULL DEFAULT false,
        CONSTRAINT "PK_cameras_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_cameras_camera_id" UNIQUE ("camera_id"),
        CONSTRAINT "UQ_cameras_code" UNIQUE ("code"),
        CONSTRAINT "FK_cameras_line_id" FOREIGN KEY ("line_id") REFERENCES "master"."lines"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_CAMERAS_CAMERA_ID" ON "master"."cameras" ("camera_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_CAMERAS_CODE" ON "master"."cameras" ("code")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "master"."IDX_CAMERAS_CODE"`);
    await queryRunner.query(`DROP INDEX "master"."IDX_CAMERAS_CAMERA_ID"`);
    await queryRunner.query(`DROP TABLE "master"."cameras"`);
  }
}
