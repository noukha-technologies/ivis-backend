import type { QueryRunner } from 'typeorm';

/** Application schemas populated by IVIS migrations (excludes public/typeorm metadata). */
export const WIPE_TARGET_SCHEMAS = ['core', 'master', 'transaction'] as const;

export type WipeTargetSchema = (typeof WIPE_TARGET_SCHEMAS)[number];

interface PgTableRef {
  schemaname: string;
  tablename: string;
}

/**
 * Removes all rows from every table in core, master, and transaction schemas.
 * Schema and tables are preserved; identity/serial sequences are reset.
 */
export async function wipeAllApplicationData(queryRunner: QueryRunner): Promise<string[]> {
  const tables = (await queryRunner.query(
    `
      SELECT schemaname, tablename
      FROM pg_tables
      WHERE schemaname = ANY($1::text[])
      ORDER BY schemaname, tablename
    `,
    [WIPE_TARGET_SCHEMAS],
  )) as PgTableRef[];

  if (tables.length === 0) {
    return [];
  }

  const qualified = tables
    .map((t) => `"${t.schemaname}"."${t.tablename}"`)
    .join(', ');

  await queryRunner.query(
    `TRUNCATE TABLE ${qualified} RESTART IDENTITY CASCADE`,
  );

  return tables.map((t) => `${t.schemaname}.${t.tablename}`);
}
