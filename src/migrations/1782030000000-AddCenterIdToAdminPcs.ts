import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCenterIdToAdminPcs1782030000000 implements MigrationInterface {
  name = 'AddCenterIdToAdminPcs1782030000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "master"."admin_pcs" ADD COLUMN IF NOT EXISTS "center_id" bigint`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_ADMIN_PC_CENTER_ID" ON "master"."admin_pcs" ("center_id")`,
    );
    // Add foreign key constraint if it doesn't exist
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 
          FROM information_schema.table_constraints 
          WHERE constraint_name = 'FK_ADMIN_PC_CENTER_ID' 
            AND table_name = 'admin_pcs'
        ) THEN
          ALTER TABLE "master"."admin_pcs"
          ADD CONSTRAINT "FK_ADMIN_PC_CENTER_ID"
          FOREIGN KEY ("center_id")
          REFERENCES "master"."centres"("id")
          ON DELETE SET NULL;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "master"."admin_pcs" DROP CONSTRAINT IF EXISTS "FK_ADMIN_PC_CENTER_ID"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "master"."IDX_ADMIN_PC_CENTER_ID"`,
    );
    await queryRunner.query(
      `ALTER TABLE "master"."admin_pcs" DROP COLUMN IF EXISTS "center_id"`,
    );
  }
}
