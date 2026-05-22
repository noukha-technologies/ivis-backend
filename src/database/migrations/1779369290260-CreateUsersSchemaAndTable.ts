import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateUsersSchemaAndTable1779369290260 implements MigrationInterface {
    name = 'CreateUsersSchemaAndTable1779369290260'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "users"`);
        await queryRunner.query(`
            CREATE TABLE "users"."users" (
                "id"         uuid                NOT NULL DEFAULT uuid_generate_v4(),
                "user_id"    integer             NOT NULL,
                "user_name"  character varying   NOT NULL,
                "email"      character varying   NOT NULL,
                "role"       character varying   NOT NULL,
                "center"     character varying,
                "line"       character varying,
                "is_deleted" boolean             NOT NULL DEFAULT false,
                "created_at" TIMESTAMP           NOT NULL DEFAULT NOW(),
                "updated_at" TIMESTAMP           NOT NULL DEFAULT NOW(),
                CONSTRAINT "UQ_96aac72f1574b88752e9fb00089" UNIQUE ("user_id"),
                CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"),
                CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_USER_USER_ID" ON "users"."users" ("user_id")`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_USER_EMAIL"   ON "users"."users" ("email")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "users"."IDX_USER_EMAIL"`);
        await queryRunner.query(`DROP INDEX "users"."IDX_USER_USER_ID"`);
        await queryRunner.query(`DROP TABLE "users"."users"`);
        await queryRunner.query(`DROP SCHEMA IF EXISTS "users" CASCADE`);
    }
}
