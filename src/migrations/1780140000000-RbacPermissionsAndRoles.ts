import { MigrationInterface, QueryRunner } from 'typeorm';
import { generateSnowflakeId } from '../common/shared/snowflakeIdGeneration';

const SYSTEM_ROLE_NAMES = new Set([
  'admin',
  'system_admin',
  'client_admin',
  'super admin',
  'super_admin',
]);

async function tableExists(
  queryRunner: QueryRunner,
  schema: string,
  table: string,
): Promise<boolean> {
  const rows: Array<{ exists: number }> = await queryRunner.query(
    `SELECT 1 AS "exists"
     FROM information_schema.tables
     WHERE table_schema = $1 AND table_name = $2`,
    [schema, table],
  );
  return rows.length > 0;
}

export class RbacPermissionsAndRoles1780140000000 implements MigrationInterface {
  name = 'RbacPermissionsAndRoles1780140000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "core"."permissions" (
        "id"          bigint              NOT NULL,
        "name"        character varying(128) NOT NULL,
        "description" character varying(512),
        "access"      jsonb               NOT NULL DEFAULT '{}'::jsonb,
        "is_active"   boolean             NOT NULL DEFAULT true,
        "created_by"  character varying,
        "created_at"  TIMESTAMP           NOT NULL DEFAULT NOW(),
        "updated_at"  TIMESTAMP           NOT NULL DEFAULT NOW(),
        "is_deleted"  boolean             NOT NULL DEFAULT false,
        CONSTRAINT "PK_permissions_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_permissions_name" UNIQUE ("name"),
        CONSTRAINT "chk_permissions_access_object"
          CHECK (jsonb_typeof("access") = 'object' AND "access" <> '{}'::jsonb)
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_PERMISSION_PROFILE_NAME"
      ON "core"."permissions" ("name")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "core"."roles" (
        "id"            bigint              NOT NULL,
        "role_id"       integer             NOT NULL,
        "role_name"     character varying(64) NOT NULL,
        "permission_id" bigint              NOT NULL,
        "description"   character varying(512),
        "created_by"    character varying,
        "created_at"    TIMESTAMP           NOT NULL DEFAULT NOW(),
        "updated_at"    TIMESTAMP           NOT NULL DEFAULT NOW(),
        "is_deleted"    boolean             NOT NULL DEFAULT false,
        CONSTRAINT "PK_roles_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_roles_role_id" UNIQUE ("role_id"),
        CONSTRAINT "UQ_roles_role_name" UNIQUE ("role_name"),
        CONSTRAINT "UQ_roles_permission_id" UNIQUE ("permission_id"),
        CONSTRAINT "FK_roles_permission_id"
          FOREIGN KEY ("permission_id") REFERENCES "core"."permissions"("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_ROLE_ROLE_NAME"
      ON "core"."roles" ("role_name")
    `);

    const roleAccessMap = new Map<string, string>();

    if (await tableExists(queryRunner, 'core', 'role_access')) {
      const legacyRows: Array<{
        id: string;
        role_name: string;
        access: object;
        created_by: string | null;
      }> = await queryRunner.query(`
        SELECT "id", "role_name", "access", "created_by"
        FROM "core"."role_access"
        WHERE "is_deleted" = false
      `);

      let roleSeq = 0;
      for (const row of legacyRows) {
        roleSeq += 1;
        const permissionId = generateSnowflakeId();
        const roleId = generateSnowflakeId();
        const profileName = `${String(row.role_name).trim()} Access`;
        const normalizedRole = String(row.role_name).trim().toLowerCase();
        const isSystem = SYSTEM_ROLE_NAMES.has(normalizedRole) ||
          SYSTEM_ROLE_NAMES.has(normalizedRole.replace(/\s+/g, '_'));

        await queryRunner.query(
          `
            INSERT INTO "core"."permissions" ("id", "name", "description", "access", "is_active", "is_deleted", "created_by")
            VALUES ($1::bigint, $2::varchar, $3::varchar, $4::jsonb, true, false, $5::varchar)
          `,
          [
            permissionId,
            profileName,
            `Access profile migrated from role_access for ${row.role_name}`,
            JSON.stringify(row.access),
            row.created_by,
          ],
        );

        await queryRunner.query(
          `
            INSERT INTO "core"."roles" (
              "id", "role_id", "role_name", "permission_id", "description",
              "is_deleted", "created_by"
            )
            VALUES ($1::bigint, $2::integer, $3::varchar, $4::bigint, $5::varchar, false, $6::varchar)
          `,
          [
            roleId,
            roleSeq,
            String(row.role_name).trim(),
            permissionId,
            `Role migrated from role_access`,
            row.created_by,
          ],
        );

        roleAccessMap.set(String(row.id), roleId);
      }
    }

    await queryRunner.query(`
      ALTER TABLE "core"."users" ADD COLUMN IF NOT EXISTS "role_id" bigint
    `);

    if (roleAccessMap.size > 0) {
      for (const [oldRoleAccessId, newRoleId] of roleAccessMap.entries()) {
        await queryRunner.query(
          `
            UPDATE "core"."users"
            SET "role_id" = $1::bigint
            WHERE "role_access_id" = $2::bigint
          `,
          [newRoleId, oldRoleAccessId],
        );
      }
    }

    const defaultRole = await queryRunner.query(`
      SELECT "id" FROM "core"."roles" WHERE "is_deleted" = false ORDER BY "role_id" ASC LIMIT 1
    `);
    if (defaultRole.length > 0) {
      await queryRunner.query(
        `
          UPDATE "core"."users"
          SET "role_id" = $1::bigint
          WHERE "role_id" IS NULL
        `,
        [defaultRole[0].id],
      );
    }

    await queryRunner.query(`
      ALTER TABLE "core"."users" DROP CONSTRAINT IF EXISTS "FK_users_role_access_id"
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS "core"."IDX_USER_ROLE_ACCESS_ID"`);
    await queryRunner.query(`
      ALTER TABLE "core"."users" DROP COLUMN IF EXISTS "role_access_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "core"."users" ALTER COLUMN "role_id" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "core"."users" DROP CONSTRAINT IF EXISTS "FK_users_role_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "core"."users"
      ADD CONSTRAINT "FK_users_role_id"
      FOREIGN KEY ("role_id") REFERENCES "core"."roles"("id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_USER_ROLE_ID" ON "core"."users" ("role_id")
    `);

    if (await tableExists(queryRunner, 'core', 'role_access')) {
      await queryRunner.query(`DROP TABLE IF EXISTS "core"."role_access"`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "core"."role_access" (
        "id" bigint NOT NULL,
        "role_name" character varying(64) NOT NULL,
        "access" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_by" character varying,
        "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT NOW(),
        "is_deleted" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_role_access_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "core"."users" ADD COLUMN IF NOT EXISTS "role_access_id" bigint
    `);

    await queryRunner.query(`
      ALTER TABLE "core"."users" DROP CONSTRAINT IF EXISTS "FK_users_role_id"
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS "core"."IDX_USER_ROLE_ID"`);
    await queryRunner.query(`ALTER TABLE "core"."users" DROP COLUMN IF EXISTS "role_id"`);

    await queryRunner.query(`DROP TABLE IF EXISTS "core"."roles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "core"."permissions"`);
  }
}
