import { MigrationInterface, QueryRunner } from 'typeorm';

const TRANSACTION_TABLES = [
  'vehicle_records',
  'customers',
  'anpr_captures',
  'rop_verifications',
  'jobs',
  'appointments',
  'payment_transactions',
] as const;

export class MoveTransactionTablesToTransactionSchema1780050000000
  implements MigrationInterface
{
  name = 'MoveTransactionTablesToTransactionSchema1780050000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "transaction"`);

    for (const table of TRANSACTION_TABLES) {
      await this.moveTableFromCoreIfExists(queryRunner, table, 'transaction');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const reversed = [...TRANSACTION_TABLES].reverse();
    for (const table of reversed) {
      await this.moveTableFromCoreIfExists(queryRunner, table, 'core');
    }
  }

  private async moveTableFromCoreIfExists(
    queryRunner: QueryRunner,
    table: string,
    targetSchema: 'transaction' | 'core',
  ): Promise<void> {
    const sourceSchema = targetSchema === 'transaction' ? 'core' : 'transaction';
    const result = await queryRunner.query(
      `SELECT to_regclass('${sourceSchema}.${table}') AS regclass`,
    );
    if (!result[0]?.regclass) {
      return;
    }
    await queryRunner.query(
      `ALTER TABLE "${sourceSchema}"."${table}" SET SCHEMA "${targetSchema}"`,
    );
  }
}
