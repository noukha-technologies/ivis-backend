import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { buildDatabaseOptions } from './database.config';
import { Role } from './entity/role.entity';
import { User } from './entity/user.entity';
import { UserSession } from './entity/user-session.entity';
import { Vehicle } from './entity/vehicle.entity';

dotenv.config();

export const AppDataSource = new DataSource({
  ...buildDatabaseOptions(),
  logging: buildDatabaseOptions().logging ?? true,
  entities: [User, Role, UserSession, Vehicle],
  migrations: [__dirname + '/../../migrations/*{.ts,.js}'],
  subscribers: [],
});
