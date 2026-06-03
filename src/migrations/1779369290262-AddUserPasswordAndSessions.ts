import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserPasswordAndSessions1779369290262 implements MigrationInterface {
  name = 'AddUserPasswordAndSessions1779369290262';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "core"`);
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "master"`);

    await this.moveLegacySchema(queryRunner, 'users', 'users', 'core');
    await this.moveLegacySchema(queryRunner, 'users', 'user_sessions', 'core');
    await this.moveLegacySchema(queryRunner, 'masters', 'roles', 'master');

    await this.ensureCoreUsersTable(queryRunner);
    await this.ensureMasterRolesTable(queryRunner);

    await queryRunner.query(`
      ALTER TABLE "core"."users"
      ADD COLUMN IF NOT EXISTS "password" character varying
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "core"."user_sessions" (
        "id" bigint NOT NULL,
        "user_id" bigint NOT NULL,
        "access_token_jti" character varying NOT NULL,
        "refresh_token_jti" character varying NOT NULL,
        "refresh_token" character varying NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "expired_at" TIMESTAMP NOT NULL,
        "last_refreshed_at" TIMESTAMP,
        "metadata" jsonb,
        "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_user_sessions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_user_sessions_user" FOREIGN KEY ("user_id")
          REFERENCES "core"."users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_user_sessions_user_jti"
      ON "core"."user_sessions" ("user_id", "access_token_jti")
    `);
  }

  private async tableExists(
    queryRunner: QueryRunner,
    schema: string,
    table: string,
  ): Promise<boolean> {
    const rows = await queryRunner.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = $1 AND table_name = $2 LIMIT 1`,
      [schema, table],
    );
    return rows.length > 0;
  }

  private async moveLegacySchema(
    queryRunner: QueryRunner,
    fromSchema: string,
    table: string,
    toSchema: string,
  ): Promise<void> {
    if (await this.tableExists(queryRunner, fromSchema, table)) {
      await queryRunner.query(
        `ALTER TABLE "${fromSchema}"."${table}" SET SCHEMA "${toSchema}"`,
      );
    }
  }

  private async ensureCoreUsersTable(queryRunner: QueryRunner): Promise<void> {
    if (await this.tableExists(queryRunner, 'core', 'users')) {
      return;
    }

    await queryRunner.query(`
      CREATE TABLE "core"."users" (
        "id"         bigint              NOT NULL,
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
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_USER_USER_ID" ON "core"."users" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_USER_EMAIL" ON "core"."users" ("email")`,
    );
  }

  private async ensureMasterRolesTable(queryRunner: QueryRunner): Promise<void> {
    if (await this.tableExists(queryRunner, 'master', 'roles')) {
      return;
    }

    await queryRunner.query(`
      CREATE TABLE "master"."roles" (
        "id"          bigint              NOT NULL,
        "role_name"   character varying   NOT NULL,
        "description" character varying,
        "is_deleted"  boolean             NOT NULL DEFAULT false,
        "created_at"  TIMESTAMP           NOT NULL DEFAULT NOW(),
        "updated_at"  TIMESTAMP           NOT NULL DEFAULT NOW(),
        CONSTRAINT "UQ_ROLE_ROLE_NAME" UNIQUE ("role_name"),
        CONSTRAINT "PK_ROLE_ID" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_ROLE_ROLE_NAME" ON "master"."roles" ("role_name")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "core"."IDX_user_sessions_user_jti"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "core"."user_sessions"`);
    await queryRunner.query(`
      ALTER TABLE "core"."users" DROP COLUMN IF EXISTS "password"
    `);
  }
}
