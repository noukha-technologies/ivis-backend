import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserPasswordAndSessions1779369290262 implements MigrationInterface {
  name = 'AddUserPasswordAndSessions1779369290262';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "core"."users"
      ADD COLUMN IF NOT EXISTS "password_hash" character varying
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

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "core"."IDX_user_sessions_user_jti"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "core"."user_sessions"`);
    await queryRunner.query(`
      ALTER TABLE "core"."users" DROP COLUMN IF EXISTS "password_hash"
    `);
  }
}
