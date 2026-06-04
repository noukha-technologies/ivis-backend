import { MigrationInterface, QueryRunner } from 'typeorm';

/** Allow users without an assigned centre; line required only when centre is set (enforced in app). */
export class UsersCenterIdOptional1780180000000 implements MigrationInterface {
  name = 'UsersCenterIdOptional1780180000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "core"."users"
      ALTER COLUMN "center_id" DROP NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const nullCentreUsers: { count: string }[] = await queryRunner.query(`
      SELECT COUNT(*)::text AS count FROM "core"."users"
      WHERE is_deleted = false AND center_id IS NULL
    `);
    if (Number(nullCentreUsers[0]?.count) > 0) {
      throw new Error(
        'Migration rollback aborted: assign center_id to all active users before reverting UsersCenterIdOptional.',
      );
    }

    await queryRunner.query(`
      ALTER TABLE "core"."users"
      ALTER COLUMN "center_id" SET NOT NULL
    `);
  }
}
