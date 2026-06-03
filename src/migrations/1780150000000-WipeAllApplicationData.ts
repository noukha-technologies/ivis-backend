import { MigrationInterface, QueryRunner } from 'typeorm';
import { wipeAllApplicationData } from './helpers/wipe-all-application-data';

/**
 * Destructive data reset — truncates all rows in core, master, and transaction tables.
 *
 * Not run during normal `migration:run` unless ALLOW_DATA_WIPE_MIGRATION=true.
 * Prefer: npm run wipe:start (repeatable, does not depend on migration history).
 */
export class WipeAllApplicationData1780150000000 implements MigrationInterface {
  name = 'WipeAllApplicationData1780150000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (process.env.ALLOW_DATA_WIPE_MIGRATION !== 'true') {
      console.warn(
        '[WipeAllApplicationData] Skipped: set ALLOW_DATA_WIPE_MIGRATION=true or use npm run wipe:start',
      );
      return;
    }

    const wiped = await wipeAllApplicationData(queryRunner);
    console.warn(
      `[WipeAllApplicationData] Truncated ${wiped.length} table(s): ${wiped.join(', ')}`,
    );
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    console.warn(
      '[WipeAllApplicationData] down() is a no-op — truncated data cannot be restored.',
    );
  }
}
