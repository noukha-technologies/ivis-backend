import { MigrationInterface, QueryRunner } from 'typeorm';

/** Inserts any permission keys added after the initial permissions migration */
const NEW_PERMISSION_SEED: Array<{ key: string; description: string }> = [
  { key: 'USER_DELETE', description: 'Delete users' },
  { key: 'ROLES_CREATE', description: 'Create roles' },
  { key: 'ROLES_DELETE', description: 'Delete roles' },
  { key: 'PERMISSIONS_CREATE', description: 'Create permissions' },
  { key: 'PERMISSIONS_DELETE', description: 'Delete permissions' },
  { key: 'MASTERS_CREATE', description: 'Create master data' },
  { key: 'MASTERS_DELETE', description: 'Delete master data' },
  { key: 'ANPR_UPSERT', description: 'Create and update ANPR captures' },
  { key: 'ANPR_DELETE', description: 'Delete ANPR captures' },
  { key: 'ROP_CREATE', description: 'Create ROP verifications' },
  { key: 'ROP_UPSERT', description: 'Create and update ROP verifications' },
  { key: 'ROP_DELETE', description: 'Delete ROP verifications' },
  { key: 'VEHICLE_RECORDS_CREATE', description: 'Create vehicle records' },
  { key: 'VEHICLE_RECORDS_UPSERT', description: 'Create and update vehicle records' },
  { key: 'VEHICLE_RECORDS_DELETE', description: 'Delete vehicle records' },
  { key: 'CUSTOMERS_CREATE', description: 'Create customers' },
  { key: 'CUSTOMERS_DELETE', description: 'Delete customers' },
  { key: 'PAYMENTS_CREATE', description: 'Create payment transactions' },
  { key: 'PAYMENTS_DELETE', description: 'Delete payment transactions' },
  { key: 'APPOINTMENTS_CREATE', description: 'Create appointments' },
  { key: 'APPOINTMENTS_DELETE', description: 'Delete appointments' },
  { key: 'JOBS_CREATE', description: 'Create inspection jobs' },
  { key: 'JOBS_DELETE', description: 'Delete inspection jobs' },
];

export class SyncPermissionKeys1780070000000 implements MigrationInterface {
  name = 'SyncPermissionKeys1780070000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (let i = 0; i < NEW_PERMISSION_SEED.length; i++) {
      const { key, description } = NEW_PERMISSION_SEED[i];
      const id = `178007000000000${String(i).padStart(4, '0')}`;

      await queryRunner.query(
        `
          INSERT INTO "core"."permissions" ("id", "key", "description", "is_active", "is_deleted")
          VALUES ($1, $2, $3, true, false)
          ON CONFLICT ("key") DO UPDATE
          SET "description" = EXCLUDED."description",
              "is_active" = true,
              "is_deleted" = false,
              "updated_at" = NOW()
        `,
        [id, key, description],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const keys = NEW_PERMISSION_SEED.map((row) => row.key);
    await queryRunner.query(
      `
        UPDATE "core"."permissions"
        SET "is_deleted" = true, "is_active" = false, "updated_at" = NOW()
        WHERE "key" = ANY($1)
      `,
      [keys],
    );
  }
}
