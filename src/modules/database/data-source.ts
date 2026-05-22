import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { buildDatabaseOptions } from './database.config';

dotenv.config();

export const AppDataSource = new DataSource({
  ...buildDatabaseOptions(),
  logging: buildDatabaseOptions().logging ?? true,
  entities: [__dirname + '/../../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../../migrations/*{.ts,.js}'],
  subscribers: [],
});
