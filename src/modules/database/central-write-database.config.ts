import type { LoggerOptions } from 'typeorm';

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function requireEnvInt(name: string): number {
  const raw = requireEnv(name);
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(
      `Environment variable ${name} must be a valid integer (got "${raw}")`,
    );
  }
  return parsed;
}

function parseDbLogging(): LoggerOptions {
  const value = process.env.CENTRAL_DB_WRITE_LOGGING?.trim().toLowerCase();
  if (value === 'true' || value === '1') {
    return true;
  }
  if (value === 'all') {
    return 'all';
  }
  return false;
}

export interface CentralWriteDatabaseConfig {
  type: 'postgres';
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  synchronize: boolean;
  logging: LoggerOptions;
  ssl: false | { rejectUnauthorized: boolean };
}

/**
 * Database Sync's writable connection into the central Master Database —
 * deliberately SEPARATE from CENTRAL_DB_* (central-database.config.ts),
 * which is read-only by design and used by Onboarding Sync's pull-only
 * reader. Used only to push bucket B/C data (see DATABASE_SYNC_PLAN.md §2)
 * up from this centre. Credentials should be PER-CENTRE (a distinct
 * Postgres role per centre server, not shared) and scoped (infra-level) to
 * INSERT/UPDATE only on the transaction schema plus the specific bucket-C
 * master tables — never the bucket-A tables (roles, permissions,
 * payment_types, etc.), so "central always wins" for bucket A holds true
 * even if application code had a bug.
 *
 * Deliberately NOT wired through ConfigModule/registerAs, unlike
 * central-database.config.ts — that pattern resolves eagerly at app
 * bootstrap, which would make CENTRAL_DB_WRITE_* mandatory for the whole
 * app to start even though Database Sync is optional add-on functionality
 * a centre may not have been provisioned with yet. This function is called
 * lazily, only when a sync actually attempts to push (see
 * CentralSyncWriterService.ensureConnected()) — so an unconfigured writable
 * connection surfaces as a catchable sync failure, never an app-wide boot
 * failure.
 */
export function buildCentralWriteDatabaseOptions(): CentralWriteDatabaseConfig {
  const sslMode = process.env.CENTRAL_DB_WRITE_SSLMODE?.trim() || 'disable';

  return {
    type: 'postgres',
    host: requireEnv('CENTRAL_DB_WRITE_HOST'),
    port: requireEnvInt('CENTRAL_DB_WRITE_PORT'),
    username: requireEnv('CENTRAL_DB_WRITE_USER'),
    password: requireEnv('CENTRAL_DB_WRITE_PASSWORD'),
    database: requireEnv('CENTRAL_DB_WRITE_DB'),
    synchronize: false,
    logging: parseDbLogging(),
    ssl: sslMode === 'require' ? { rejectUnauthorized: false } : false,
  };
}
