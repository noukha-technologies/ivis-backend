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
  const value = process.env.DB_LOGGING?.trim().toLowerCase();
  if (value === 'true' || value === '1') {
    return true;
  }
  if (value === 'all') {
    return 'all';
  }
  return false;
}

export interface DatabaseConfig {
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

export const buildDatabaseOptions = (): DatabaseConfig => {
  const sslMode = process.env.POSTGRES_SSLMODE?.trim() || 'disable';

  return {
    type: 'postgres',
    host: requireEnv('POSTGRES_HOST'),
    port: requireEnvInt('POSTGRES_PORT'),
    username: requireEnv('POSTGRES_USER'),
    password: requireEnv('POSTGRES_PASSWORD'),
    database: requireEnv('POSTGRES_DB'),
    synchronize: false,
    logging: parseDbLogging(),
    ssl: sslMode === 'require' ? { rejectUnauthorized: false } : false,
  };
};

export default registerAs('database', buildDatabaseOptions);
