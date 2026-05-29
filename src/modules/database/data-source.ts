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
import { VehicleRecord } from './entity/vehicle-record.entity';
import { Customer } from './entity/customer.entity';
import { Job } from './entity/job.entity';
import { Appointment } from './entity/appointment.entity';
import { PaymentTransaction } from './entity/payment-transaction.entity';

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
    Customer,
    VehicleRecord,
    Job,
    Appointment,
    PaymentTransaction,
  ],
  migrations: [__dirname + '/../../migrations/*{.ts,.js}'],
  subscribers: [],
});
