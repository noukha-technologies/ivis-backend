import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Standalone WIPE migration — clears OPERATIONAL data only: appointments, jobs,
 * payments and everything that hangs off them.
 *
 * Deliberately narrower than WipeData (1782020000000), which empties master and
 * identity data too. This one leaves centres, lines, cameras, charges, users and
 * roles completely untouched, so a centre stays linked to its appointment-
 * provider branch. It is the reset you want between test runs; WipeData is the
 * one you want to start over.
 *
 * Because that provider link survives, the ingest would re-fetch and recreate
 * every online booking on its next poll — so this migration also pauses the
 * ingest for a short window (see pauseAppointmentIngest). The pause is
 * time-boxed and lifts itself; nothing needs to be run afterwards.
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

  /**
   * Flag key in `core.system_flags` read by AppointmentIngestService before
   * every poll. Must stay in sync with INGEST_PAUSED_FLAG in that service.
   */
  private static readonly INGEST_PAUSED_FLAG = 'appointment_ingest_paused';

  /**
   * How long the post-wipe pause lasts. Long enough to inspect a genuinely
   * empty system, short enough that forgetting to resume costs one coffee
   * break rather than a day of bookings that never arrived.
   */
  private static readonly INGEST_PAUSE_MINUTES = 15;

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

    await this.pauseAppointmentIngest(queryRunner);

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

  /**
   * Stops the appointment ingest from immediately undoing this wipe.
   *
   * The provider — not this database — is the source of truth for online
   * bookings, so the next poll re-fetches every booking we just deleted and
   * recreates the appointment, vehicle record, customer and payment behind it.
   * At the current 10s cadence the queue is visibly back before the operator
   * has finished reading the wipe output, which reads as "the wipe did not
   * work".
   *
   * The switch is a database row rather than an env var because the wipe runs
   * as its own short-lived process: it must be able to stop a backend that is
   * already running, and stay set across restarts.
   *
   * The pause is TIME-BOXED, not indefinite. The Online Appointments screen
   * reads the local mirror this ingest fills, so a pause left set does not just
   * keep the queue empty — it blanks that screen entirely, with nothing on it
   * to say why. A maintenance command must not be able to leave the system in
   * that state, so the pause lifts itself once the window elapses. There is no
   * manual resume: the only writer is this migration, and a time-boxed pause
   * needs no operator to clear it.
   */
  private async pauseAppointmentIngest(
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "core"."system_flags" (
        "key" varchar(64) PRIMARY KEY,
        "value" varchar(255) NOT NULL,
        "updated_at" timestamp NOT NULL DEFAULT NOW()
      )
    `);

    const expiresAt = new Date(
      Date.now() +
        WipeTransactions1782030000000.INGEST_PAUSE_MINUTES * 60 * 1000,
    ).toISOString();

    await queryRunner.query(
      `
      INSERT INTO "core"."system_flags" ("key", "value", "updated_at")
      VALUES ($1, $2, NOW())
      ON CONFLICT ("key")
      DO UPDATE SET "value" = $2, "updated_at" = NOW()
      `,
      [WipeTransactions1782030000000.INGEST_PAUSED_FLAG, expiresAt],
    );

    console.warn(
      `[WipeTransactions] Appointment ingest PAUSED for ` +
        `${WipeTransactions1782030000000.INGEST_PAUSE_MINUTES} minutes (until ${expiresAt})\n` +
        '[WipeTransactions] so the provider does not repopulate what was just deleted.\n' +
        '[WipeTransactions] It resumes automatically when the window elapses.',
    );
  }

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
