import 'reflect-metadata';
import { loadEnv } from '../../common/config/env.config';
import { DataSource } from 'typeorm';
import { buildDatabaseOptions } from './database.config';
import { buildAppDataSourceOptions } from './data-source-options.factory';

// Same per-environment resolution the app uses, so a script and the running
// app can never disagree about which database they target.
loadEnv();

// Canonical timezone for the migration CLI (matches the app — store UTC).
process.env.TZ = process.env.TZ || 'UTC';
process.env.PGTZ = process.env.PGTZ || 'UTC';

const databaseOptions = buildDatabaseOptions();

export const AppDataSource = new DataSource({
  ...databaseOptions,
  ...buildAppDataSourceOptions(),
});
