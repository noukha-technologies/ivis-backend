import { registerAs } from '@nestjs/config';
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
  const value = process.env.CENTRAL_DB_LOGGING?.trim().toLowerCase();
  if (value === 'true' || value === '1') {
    return true;
  }
  if (value === 'all') {
    return 'all';
  }
  return false;
}

export interface CentralDatabaseConfig {
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

// Master Database connection ("central" — not "master": that name is taken by
// an existing Postgres *schema* in the single-DB world). Credentials here must
// point at a read-only Postgres role; this connection only ever reads.
export const buildCentralDatabaseOptions = (): CentralDatabaseConfig => {
  const sslMode = process.env.CENTRAL_DB_SSLMODE?.trim() || 'disable';

  return {
    type: 'postgres',
    host: requireEnv('CENTRAL_DB_HOST'),
    port: requireEnvInt('CENTRAL_DB_PORT'),
    username: requireEnv('CENTRAL_DB_USER'),
    password: requireEnv('CENTRAL_DB_PASSWORD'),
    database: requireEnv('CENTRAL_DB_DB'),
    synchronize: false,
    logging: parseDbLogging(),
    ssl: sslMode === 'require' ? { rejectUnauthorized: false } : false,
  };
};

export default registerAs('centralDatabase', buildCentralDatabaseOptions);
