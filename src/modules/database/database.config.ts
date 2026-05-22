import { registerAs } from '@nestjs/config';

export interface DatabaseConfig {
  type: 'postgres';
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  synchronize: boolean;
  logging: boolean;
  ssl: boolean | { rejectUnauthorized: boolean };
}

export const buildDatabaseOptions = (): DatabaseConfig => ({
  type: 'postgres',
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  username: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'postgres',
  database: process.env.POSTGRES_DB || 'ivis_db',
  synchronize: false,
  logging: process.env.DB_LOGGING === 'true',
  ssl:
    process.env.POSTGRES_SSLMODE === 'require'
      ? { rejectUnauthorized: false }
      : false,
});

export default registerAs('database', buildDatabaseOptions);
