import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Standalone WIPE migration — clears OPERATIONAL data only: appointments, jobs,
 * payments and everything that hangs off them.
 *
 * Deliberately narrower than WipeData (1782020000000), which empties master and
 * identity data too. This one leaves centres, lines, cameras, charges, users and
 * roles completely untouched, so a centre stays linked to its appointment-
 * provider branch and the ingest repopulates on its next poll. It is the reset
 * you want between test runs; WipeData is the one you want to start over.
 *
 * Run with:  npm run migration:wipe-transactions
 *
 * Guards on ALLOW_DATA_WIPE=true so it is never executed by accident during a
 * normal `migration:run`.
 *
 * Why DELETE (not TRUNCATE … CASCADE):
 *   - `appointments.payment_id ↔ payments.appointment_id` form a circular FK,
 *     so those link columns are nulled first, then rows are deleted
 *     child → parent.
 *   - `anpr_captures.rop_verification_id ↔ rop_verifications.anpr_capture_id`
 *     is the same shape of circular FK.
 *   - CASCADE follows FK existence rather than row contents, so it would reach
 *     tables this migration is meant to preserve.
 *
 * Note: row deletes do not reset identity sequences, but the numeric *_id
 * values (appointment_id, job_id, payment_id, …) are derived as MAX(col)+1 by
 * the DAOs, so they restart from 1 once the tables are empty.
 *
 * down() is intentionally a no-op — deleted data cannot be restored.
 */
export class WipeTransactions1782030000000 implements MigrationInterface {
  name = 'WipeTransactions1782030000000';

  /** Tables to wipe, ordered child → parent so plain DELETEs satisfy every FK. */
  private static readonly WIPE_ORDER = [
    // payments has direct FKs to jobs, appointments and anpr_captures, so it
    // must go before all three.
    '"transaction"."payments"',
    // job_images.job_id → jobs
    '"transaction"."job_images"',
    // jobs.appointment_id → appointments
    '"transaction"."jobs"',
    // appointment_bookings.appointment_id → appointments (the ingest mirror of
    // the provider's bookings).
    '"transaction"."appointment_bookings"',
    // Outbound webhook queue. No FKs, but leaving it would replay events
    // against jobs that no longer exist.
    '"transaction"."tajdeed_outbox"',
    '"transaction"."appointments"',
    // rop_verifications.anpr_capture_id → anpr_captures
    '"transaction"."rop_verifications"',
    '"transaction"."anpr_captures"',
    // Created by the ingest and by ANPR intake, so part of the same generated
    // data set rather than master data.
    '"transaction"."customers"',
    '"transaction"."vehicle_records"',
  ] as const;

  /** Master and identity data, intentionally KEPT. */
  private static readonly PRESERVED = [
    'master.centres',
    'master.lines',
    'master.cameras',
    'master.admin_pcs',
    'master.charges',
    'core.users',
    'core.roles',
    'core.permissions',
  ] as const;

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (process.env.ALLOW_DATA_WIPE !== 'true') {
      console.warn(
        '[WipeTransactions] Skipped: set ALLOW_DATA_WIPE=true or use npm run migration:wipe-transactions',
      );
      return;
    }

    const existing = await this.existingTables(queryRunner);

    // Break the circular FKs so the ordered DELETEs below never violate a
    // constraint.
    if (existing.has('transaction.appointments')) {
      await queryRunner.query(
        `UPDATE "transaction"."appointments" SET "payment_id" = NULL`,
      );
    }
    if (existing.has('transaction.anpr_captures')) {
      await queryRunner.query(
        `UPDATE "transaction"."anpr_captures" SET "rop_verification_id" = NULL`,
      );
    }

    const targets = WipeTransactions1782030000000.WIPE_ORDER.filter((t) =>
      existing.has(this.unquotedKey(t)),
    );

    if (targets.length === 0) {
      console.warn(
        '[WipeTransactions] No transaction tables found — nothing to wipe.',
      );
      return;
    }

    console.log(
      `[WipeTransactions] Deleting rows from ${targets.length} table(s)...`,
    );
    for (const table of targets) {
      await queryRunner.query(`DELETE FROM ${table}`);
    }

    console.log(
      `[WipeTransactions] Wiped: ${targets.join(', ')}\n` +
        `[WipeTransactions] Preserved: ${WipeTransactions1782030000000.PRESERVED.join(', ')}`,
    );
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    console.warn(
      '[WipeTransactions] down() is a no-op — deleted data cannot be restored.',
    );
  }

  // ─── helpers ───────────────────────────────────────────────────────────────

  private async existingTables(queryRunner: QueryRunner): Promise<Set<string>> {
    const rows: Array<{ schemaname: string; tablename: string }> =
      await queryRunner.query(`
        SELECT schemaname, tablename
        FROM pg_tables
        WHERE schemaname IN ('core', 'master', 'transaction')
      `);
    return new Set(rows.map((r) => `${r.schemaname}.${r.tablename}`));
  }

  /** `"transaction"."jobs"` → `transaction.jobs`, for the existence lookup. */
  private unquotedKey(quoted: string): string {
    return quoted.replace(/"/g, '');
  }
}
