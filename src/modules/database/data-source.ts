import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { buildDatabaseOptions } from './database.config';
import { AdminPc } from './entity/admin-pc.entity';
import { AnprCapture } from './entity/anpr-capture.entity';
import { Camera } from './entity/camera.entity';
import { Centre } from './entity/centre.entity';
import { Line } from './entity/line.entity';
import { Payment } from './entity/payment.entity';
import { Role } from './entity/role.entity';
import { RopVerification } from './entity/rop-verification.entity';
import { Test } from './entity/test.entity';
import { User } from './entity/user.entity';
import { UserSession } from './entity/user-session.entity';
import { Vehicle } from './entity/vehicle.entity';

dotenv.config();

export const AppDataSource = new DataSource({
  ...buildDatabaseOptions(),
  logging: buildDatabaseOptions().logging ?? true,
  entities: [
    User,
    Role,
    UserSession,
    Vehicle,
    Test,
    Centre,
    Line,
    AdminPc,
    Camera,
    Payment,
    AnprCapture,
    RopVerification,
  ],
  migrations: [__dirname + '/../../migrations/*{.ts,.js}'],
  subscribers: [],
});
