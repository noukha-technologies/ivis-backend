import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { buildDatabaseOptions } from './database.config';
import { buildAppDataSourceOptions } from './data-source-options.factory';

dotenv.config();

// Canonical timezone for the migration CLI (matches the app — store UTC).
process.env.TZ = process.env.TZ || 'UTC';
process.env.PGTZ = process.env.PGTZ || 'UTC';

const databaseOptions = buildDatabaseOptions();

export const AppDataSource = new DataSource({
  ...databaseOptions,
  ...buildAppDataSourceOptions(),
});
