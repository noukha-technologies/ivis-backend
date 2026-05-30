import { MigrationInterface, QueryRunner } from 'typeorm';

/** Keep in sync with src/common/constants/permissions.ts PERMISSION_SEED_ROWS */
const PERMISSION_SEED: Array<{ key: string; description: string }> = [
  { key: 'USER_VIEW', description: 'View users' },
  { key: 'USER_CREATE', description: 'Create users' },
  { key: 'USER_EDIT', description: 'Edit users' },
  { key: 'USER_DELETE', description: 'Delete users' },
  { key: 'ROLES_CREATE', description: 'Create roles' },
  { key: 'ROLES_VIEW', description: 'View roles' },
  { key: 'ROLES_UPSERT', description: 'Create and update roles' },
  { key: 'ROLES_DELETE', description: 'Delete roles' },
  { key: 'PERMISSIONS_CREATE', description: 'Create permissions' },
  { key: 'PERMISSIONS_VIEW', description: 'View permissions' },
  { key: 'PERMISSIONS_UPSERT', description: 'Create and update permissions' },
  { key: 'PERMISSIONS_DELETE', description: 'Delete permissions' },
  { key: 'MASTERS_CREATE', description: 'Create master data' },
  { key: 'MASTERS_VIEW', description: 'View master data' },
  { key: 'MASTERS_UPSERT', description: 'Create and update master data' },
  { key: 'MASTERS_DELETE', description: 'Delete master data' },
  { key: 'ANPR_CREATE', description: 'Create ANPR captures' },
  { key: 'ANPR_VIEW', description: 'View ANPR captures' },
  { key: 'ANPR_UPSERT', description: 'Create and update ANPR captures' },
  { key: 'ANPR_DELETE', description: 'Delete ANPR captures' },
  { key: 'ROP_CREATE', description: 'Create ROP verifications' },
  { key: 'ROP_VIEW', description: 'View ROP verifications' },
  { key: 'ROP_UPSERT', description: 'Create and update ROP verifications' },
  { key: 'ROP_DELETE', description: 'Delete ROP verifications' },
  { key: 'VEHICLE_RECORDS_CREATE', description: 'Create vehicle records' },
  { key: 'VEHICLE_RECORDS_VIEW', description: 'View vehicle records' },
  { key: 'VEHICLE_RECORDS_UPSERT', description: 'Create and update vehicle records' },
  { key: 'VEHICLE_RECORDS_DELETE', description: 'Delete vehicle records' },
  { key: 'CUSTOMERS_CREATE', description: 'Create customers' },
  { key: 'CUSTOMERS_VIEW', description: 'View customers' },
  { key: 'CUSTOMERS_UPSERT', description: 'Create and update customers' },
  { key: 'CUSTOMERS_DELETE', description: 'Delete customers' },
  { key: 'PAYMENTS_CREATE', description: 'Create payment transactions' },
  { key: 'PAYMENTS_VIEW', description: 'View payment transactions' },
  { key: 'PAYMENTS_UPSERT', description: 'Create and update payment transactions' },
  { key: 'PAYMENTS_DELETE', description: 'Delete payment transactions' },
  { key: 'APPOINTMENTS_CREATE', description: 'Create appointments' },
  { key: 'APPOINTMENTS_VIEW', description: 'View appointments' },
  { key: 'APPOINTMENTS_UPSERT', description: 'Create and update appointments' },
  { key: 'APPOINTMENTS_DELETE', description: 'Delete appointments' },
  { key: 'JOBS_CREATE', description: 'Create inspection jobs' },
  { key: 'JOBS_VIEW', description: 'View inspection jobs' },
  { key: 'JOBS_UPSERT', description: 'Create and update inspection jobs' },
  { key: 'JOBS_DELETE', description: 'Delete inspection jobs' },
  { key: 'DASHBOARD_VIEW', description: 'View dashboard' },
  { key: 'REPORTS_VIEW', description: 'View reports and analytics' },
  { key: 'CONFIGURATION_VIEW', description: 'View and manage configuration' },
  { key: 'FILE_PROCESSING_VIEW', description: 'View and manage file processing' },
];

export class CreatePermissionsTable1780060000000 implements MigrationInterface {
  name = 'CreatePermissionsTable1780060000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "core"."permissions" (
        "id"          bigint              NOT NULL,
        "key"         character varying   NOT NULL,
        "description" character varying   NOT NULL,
        "is_active"   boolean             NOT NULL DEFAULT true,
        "created_by"  character varying,
        "created_at"  TIMESTAMP           NOT NULL DEFAULT NOW(),
        "updated_at"  TIMESTAMP           NOT NULL DEFAULT NOW(),
        "is_deleted"  boolean             NOT NULL DEFAULT false,
        CONSTRAINT "PK_permissions_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_permissions_key" UNIQUE ("key")
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_PERMISSION_KEY" ON "core"."permissions" ("key")`,
    );

    for (let i = 0; i < PERMISSION_SEED.length; i++) {
      const { key, description } = PERMISSION_SEED[i];
      const id = `178006000000000${String(i).padStart(4, '0')}`;

      await queryRunner.query(
        `
          INSERT INTO "core"."permissions" ("id", "key", "description", "is_active", "is_deleted")
          VALUES ($1, $2, $3, true, false)
          ON CONFLICT ("key") DO NOTHING
        `,
        [id, key, description],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "core"."IDX_PERMISSION_KEY"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "core"."permissions"`);
  }
}
