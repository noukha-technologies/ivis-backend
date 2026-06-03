import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { AppDataSource } from '../modules/database/data-source';
import { wipeAllApplicationData } from '../migrations/helpers/wipe-all-application-data';

dotenv.config();

async function main(): Promise<void> {
  const dataSource = await AppDataSource.initialize();
  const queryRunner = dataSource.createQueryRunner();

  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const wiped = await wipeAllApplicationData(queryRunner);
    await queryRunner.commitTransaction();

    if (wiped.length === 0) {
      console.log('No application tables found in core, master, or transaction schemas.');
    } else {
      console.log(`Wiped ${wiped.length} table(s):`);
      for (const table of wiped) {
        console.log(`  - ${table}`);
      }
    }
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error('Database wipe failed:', error);
  process.exit(1);
});
