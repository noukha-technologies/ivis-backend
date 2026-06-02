import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropVehicleMasterDescriptionColumn1780130000000
  implements MigrationInterface
{
  name = 'DropVehicleMasterDescriptionColumn1780130000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "master"."vehicles" DROP COLUMN IF EXISTS "description"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "master"."vehicles"
      ADD COLUMN IF NOT EXISTS "description" character varying(512)
    `);
  }
}
