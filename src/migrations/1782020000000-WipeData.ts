import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Standalone WIPE migration — clears all application DATA while preserving the
 * schema structure (tables, indexes, constraints) AND the identity tables:
 * `core.users`, `core.roles`, `core.permissions`.
 *
 * Everything else in the `core`, `master`, and `transaction` schemas is emptied
 * (including user_sessions and user_line_mappings, since the lines they map to
 * are wiped).
 *
 * Run with:  npm run migration:wipe
 *
 * Guards on ALLOW_DATA_WIPE=true so it is never executed by accident during a
 * normal `migration:run`.
 *
 * Why DELETE (not TRUNCATE … CASCADE):
 *   - `users.center_id → master.centres`, so a TRUNCATE CASCADE of centres would
 *     also truncate the users we want to keep. CASCADE follows FK existence, not
 *     row contents, so nulling center_id first is not enough — DELETE is required.
 *   - `appointments.payment_id ↔ payments.appointment_id` form a circular FK, so
 *     we null those link columns before deleting, then delete child→parent.
 *
 * Note: row deletes do not reset identity sequences, but the numeric *_id values
 * (anpr_capture_id, charge_id, …) are derived as MAX(col)+1 by the DAOs, so they
 * restart from 1 once the tables are empty.
 *
 * down() is intentionally a no-op — deleted data cannot be restored.
 */
export class WipeData1782020000000 implements MigrationInterface {
  name = 'WipeData1782020000000';

  /** Tables to wipe, ordered child → parent so plain DELETEs satisfy every FK. */
  private static readonly WIPE_ORDER = [
    // transaction (+ master.payments) — deepest dependents first
    '"transaction"."payment_transactions"',
    '"master"."payments"',
    '"transaction"."appointments"',
    '"transaction"."jobs"',
    '"transaction"."rop_verifications"',
    '"transaction"."anpr_captures"',
    '"transaction"."customers"',
    '"transaction"."vehicle_records"',
    // core link tables (deleted before master.lines they reference)
    '"core"."user_line_mappings"',
    '"core"."user_sessions"',
    // master — charges first (FKs → centres, vehicles, charge_categories)
    '"master"."charges"',
    '"master"."admin_pc_line_mappings"',
    '"master"."cameras"',
    '"master"."admin_pcs"',
    '"master"."lines"',
    // vehicles before charge_categories (vehicles.charge_category_id FK)
    '"master"."vehicles"',
    '"master"."charge_categories"',
    '"master"."centres"',
    '"master"."tests"',
  ] as const;

  /** Tables intentionally KEPT (identity / access control). */
  private static readonly PRESERVED = [
    'core.users',
    'core.roles',
    'core.permissions',
  ] as const;

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (process.env.ALLOW_DATA_WIPE !== 'true') {
      console.warn(
        '[WipeData] Skipped: set ALLOW_DATA_WIPE=true or use npm run migration:wipe',
      );
      return;
    }

    const existing = await this.existingTables(queryRunner);

    // Break FK links so the ordered DELETEs below never violate a constraint:
    //  - users → centres (keep users, drop the centre link)
    //  - appointments ↔ payments circular reference
    if (existing.has('core.users')) {
      await queryRunner.query(`UPDATE "core"."users" SET "center_id" = NULL`);
    }
    if (existing.has('transaction.appointments')) {
      await queryRunner.query(`UPDATE "transaction"."appointments" SET "payment_id" = NULL`);
    }

    const targets = WipeData1782020000000.WIPE_ORDER.filter((t) =>
      existing.has(this.unquotedKey(t)),
    );

    if (targets.length === 0) {
      console.warn('[WipeData] No application tables found — nothing to wipe.');
      return;
    }

    console.log(`[WipeData] Deleting rows from ${targets.length} table(s)...`);
    for (const table of targets) {
      await queryRunner.query(`DELETE FROM ${table}`);
    }
    console.log(
      `[WipeData] Wiped: ${targets.join(', ')} ` +
      `(preserved: ${WipeData1782020000000.PRESERVED.join(', ')})`,
    );
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    console.warn('[WipeData] down() is a no-op — deleted data cannot be restored.');
  }

  // ─── helpers ─────────────────────────────────────────────────────────────────

  private async existingTables(queryRunner: QueryRunner): Promise<Set<string>> {
    const rows: Array<{ schemaname: string; tablename: string }> =
      await queryRunner.query(`
        SELECT schemaname, tablename
        FROM pg_tables
        WHERE schemaname IN ('core', 'master', 'transaction')
      `);
    return new Set(rows.map((r) => `${r.schemaname}.${r.tablename}`));
  }

  /** Convert '"schema"."table"' → 'schema.table' for set lookup. */
  private unquotedKey(qualified: string): string {
    return qualified.replace(/"/g, '');
  }
}
