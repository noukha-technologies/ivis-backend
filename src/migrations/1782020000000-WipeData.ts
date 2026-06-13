import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Standalone WIPE migration — truncates all rows from every table in
 * the core, master, and transaction schemas while preserving schema
 * structure (tables, indexes, constraints).
 *
 * Run with:  npm run migration:wipe
 *
 * Guards on ALLOW_DATA_WIPE=true so it is never executed by accident
 * during a normal `migration:run`.
 *
 * Truncation order respects foreign-key dependencies:
 *   1. transaction (leaf rows first)
 *   2. master
 *   3. core
 *
 * down() is intentionally a no-op — truncated data cannot be restored.
 */
export class WipeData1782020000000 implements MigrationInterface {
  name = 'WipeData1782020000000';

  /**
   * Tables truncated in this exact order to satisfy FK constraints.
   * TRUNCATE … CASCADE handles any remaining FK dependencies automatically.
   */
  private static readonly WIPE_ORDER = [
    // transaction — deepest dependents first
    '"transaction"."payment_transactions"',
    '"transaction"."appointments"',
    '"transaction"."jobs"',
    '"transaction"."rop_verifications"',
    '"transaction"."anpr_captures"',
    '"transaction"."customers"',
    '"transaction"."vehicle_records"',
    // master — payments references transaction.customers so goes after
    '"master"."payments"',
    '"master"."admin_pc_line_mappings"',
    '"master"."cameras"',
    '"master"."admin_pcs"',
    '"master"."lines"',
    '"master"."centres"',
    '"master"."tests"',
    '"master"."vehicles"',
    // core — users reference roles/permissions/centres
    '"core"."user_line_mappings"',
    '"core"."user_sessions"',
    '"core"."users"',
    '"core"."roles"',
    '"core"."permissions"',
  ] as const;

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (process.env.ALLOW_DATA_WIPE !== 'true') {
      console.warn(
        '[WipeData] Skipped: set ALLOW_DATA_WIPE=true or use npm run migration:wipe',
      );
      return;
    }

    const existing = await this.existingTables(queryRunner);
    const targets = WipeData1782020000000.WIPE_ORDER.filter((t) =>
      existing.has(this.unquotedKey(t)),
    );

    if (targets.length === 0) {
      console.warn('[WipeData] No application tables found — nothing to wipe.');
      return;
    }

    console.log(`[WipeData] Truncating ${targets.length} table(s)...`);
    await queryRunner.query(
      `TRUNCATE TABLE ${targets.join(', ')} RESTART IDENTITY CASCADE`,
    );
    console.log(`[WipeData] Wiped: ${targets.join(', ')}`);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    console.warn('[WipeData] down() is a no-op — truncated data cannot be restored.');
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
