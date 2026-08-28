/**
 * Moves a vehicle's existing records back in time, so its next arrival is a
 * re-test.
 *
 * The alternative is fabricating a past visit, which produces data that only
 * resembles the real thing. Here the visit already happened — a real capture, a
 * real ROP answer, a real payment, a real submitted job — and only the clock
 * moves. Whatever the flow actually wrote is what the re-test is tested
 * against, including anything it wrote that we would have forgotten to invent.
 *
 * Usage:
 *   npm run backdate -- 3947VWX               # 3 days back
 *   npm run backdate -- 3947VWX --days 30
 *   npm run backdate -- --all --days 7        # every plate
 *   npm run backdate -- 3947VWX --days 3 --dry-run
 *
 * Options:
 *   --days N     how far back to shift (default 3)
 *   --all        shift every vehicle instead of one plate
 *   --dry-run    report what would move, change nothing
 *
 * Every timestamp of a visit shifts by the same interval, so the visit stays
 * internally consistent: the capture still precedes the appointment, which
 * still precedes the payment and the test.
 *
 * Nothing is deleted and nothing is invented. To undo, run it again with a
 * negative interval — `--days -3` shifts the same records forward.
 *
 * Refuses to run against production.
 */

import 'reflect-metadata';
import { loadEnv } from '../common/config/env.config';
import { AppDataSource } from '../modules/database/data-source';

loadEnv();

/** Table, its date columns, and how a row is tied to a plate. */
const TARGETS = [
  {
    table: 'anpr_captures',
    columns: ['capture_time', 'created_at'],
    scope: 'plate_number = :v',
  },
  {
    table: 'rop_verifications',
    columns: ['fetched_at', 'created_at'],
    scope: 'reg_no = :v',
  },
  {
    table: 'appointments',
    columns: ['appointment_at', 'created_at'],
    scope: 'vehicle_record_id = :v',
  },
  {
    table: 'payments',
    columns: ['pay_date', 'created_at'],
    scope: 'vehicle_record_id = :v',
  },
  {
    table: 'jobs',
    columns: ['started_at', 'completed_at', 'created_at'],
    scope: 'vehicle_record_id = :v',
  },
] as const;

function parseArgs(): { plate: string | null; days: number; dryRun: boolean } {
  const argv = process.argv.slice(2);
  const flag = (name: string): string | undefined => {
    const at = argv.indexOf(`--${name}`);
    return at === -1 ? undefined : argv[at + 1];
  };

  const all = argv.includes('--all');
  const first = argv[0];
  const plate =
    all || !first || first.startsWith('--') ? null : first.trim().toUpperCase();

  if (!plate && !all) {
    throw new Error(
      'Plate number is required (or --all).\n' +
        '  npm run backdate -- 3947VWX [--days 3] [--dry-run]',
    );
  }

  const days = Number(flag('days') ?? 3);
  if (!Number.isInteger(days) || days === 0) {
    throw new Error('--days must be a non-zero whole number.');
  }

  return { plate, days, dryRun: argv.includes('--dry-run') };
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to rewrite timestamps in production.');
  }

  const { plate, days, dryRun } = parseArgs();
  const ds = await AppDataSource.initialize();

  try {
    // A plate identifies the vehicle to a person; the tables key on either the
    // plate or the vehicle record, so both are resolved up front.
    let vehicleRecordId: string | null = null;
    if (plate) {
      const rows: Array<{ id: string; plate_number: string }> = await ds.query(
        `SELECT id, plate_number FROM "transaction"."vehicle_records"
          WHERE is_deleted = false AND UPPER(plate_number) = $1
          LIMIT 1`,
        [plate],
      );
      if (rows.length === 0) {
        throw new Error(
          `No vehicle record for ${plate}. Nothing to move — run the flow for this plate first, or use --all.`,
        );
      }
      vehicleRecordId = rows[0].id;
    }

    const interval = `${days} days`;
    const direction = days > 0 ? 'back' : 'forward';
    console.log(
      `${dryRun ? 'Would shift' : 'Shifting'} ${plate ?? 'every vehicle'} ${direction} by ${Math.abs(days)} day(s).`,
    );
    console.log('');

    let total = 0;
    for (const target of TARGETS) {
      // Scoping key differs per table: captures and verifications carry the
      // plate itself, the rest hang off the vehicle record.
      const scopeValue = target.scope.startsWith('vehicle_record_id')
        ? vehicleRecordId
        : plate;

      if (dryRun) {
        // No interval to bind here, so the scope value is the first parameter.
        const where = plate
          ? `is_deleted = false AND ${target.scope.replace(':v', '$1')}`
          : 'is_deleted = false';
        const rows: Array<{ count: string }> = await ds.query(
          `SELECT COUNT(*) AS count FROM "transaction"."${target.table}" WHERE ${where}`,
          plate ? [scopeValue] : [],
        );
        const count = Number(rows[0]?.count ?? 0);
        total += count;
        console.log(`  ${target.table.padEnd(18)} ${count} row(s)`);
        continue;
      }

      // The interval takes $1, so the scope value is $2.
      const where = plate
        ? `is_deleted = false AND ${target.scope.replace(':v', '$2')}`
        : 'is_deleted = false';
      const params = plate ? [interval, scopeValue] : [interval];

      // NULL columns stay NULL: a job that never started has no started_at to
      // move, and inventing one would report a test that did not happen.
      const sets = target.columns
        .map((c) => `"${c}" = "${c}" - $1::interval`)
        .join(', ');
      const result: unknown = await ds.query(
        `UPDATE "transaction"."${target.table}" SET ${sets} WHERE ${where}`,
        params,
      );
      const affected = Array.isArray(result) ? Number(result[1] ?? 0) : 0;
      total += affected;
      console.log(`  ${target.table.padEnd(18)} ${affected} row(s)`);
    }

    console.log('');
    if (dryRun) {
      console.log(
        `${total} row(s) would move. Re-run without --dry-run to apply.`,
      );
    } else {
      console.log(`${total} row(s) moved.`);
      if (plate && days > 0) {
        await reportRetestReadiness(ds, plate, vehicleRecordId!, days);
      }
    }
  } finally {
    await ds.destroy();
  }
}

/**
 * Says whether the shift actually achieved anything.
 *
 * Moving the dates is not enough on its own: a re-test is decided by a
 * COMPLETED job behind the plate, and a visit that stopped at the appointment
 * leaves none. Reporting "the next job will be a Re-test" without checking
 * claimed a result the data does not support, and sent you off to test
 * something that was never going to happen.
 */
async function reportRetestReadiness(
  ds: typeof AppDataSource,
  plate: string,
  vehicleRecordId: string,
  days: number,
): Promise<void> {
  const rows: Array<{
    job_id: string;
    status: string;
    overall_result: string | null;
  }> = await ds.query(
    `SELECT job_id, status, overall_result
         FROM "transaction"."jobs"
        WHERE is_deleted = false AND vehicle_record_id = $1
        ORDER BY created_at DESC`,
    [vehicleRecordId],
  );

  const completed = rows.find((r) => r.status === 'Completed');
  if (completed) {
    console.log(
      `${plate} now reads as visited ${days} day(s) ago, with job #J${completed.job_id} Completed (${completed.overall_result ?? 'no result'}).`,
    );
    console.log('The next job raised for this plate will be a Re-test.');
    return;
  }

  console.log('');
  console.log(
    `${plate} has no COMPLETED job, so the next job will still be a Test.`,
  );
  if (rows.length === 0) {
    console.log(
      '  No job at all — this visit stopped at the appointment. Convert it and submit it, then backdate again.',
    );
  } else {
    const states = rows.map((r) => `#J${r.job_id} ${r.status}`).join(', ');
    console.log(`  Jobs on file: ${states}.`);
    console.log(
      '  A job counts only once it reaches Completed, which is when its result is filed with ROP.',
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error((err as Error).message);
    process.exit(1);
  });
