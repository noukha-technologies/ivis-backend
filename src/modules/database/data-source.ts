import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { buildDatabaseOptions } from './database.config';

import { Job } from './entity/job.entity';
import { User } from './entity/user.entity';
import { Test } from './entity/test.entity';
import { Role } from './entity/role.entity';
import { Line } from './entity/line.entity';
import { Charge } from './entity/charge.entity';
import { ChargeCategory } from './entity/charge-category.entity';
import { Camera } from './entity/camera.entity';
import { Centre } from './entity/centre.entity';
import { Vehicle } from './entity/vehicle.entity';
import { AdminPc } from './entity/admin-pc.entity';
import { Payments } from './entity/payments.entity';
import { Customer } from './entity/customer.entity';
import { Permission } from './entity/permission.entity';
import { Appointment } from './entity/appointment.entity';
import { UserSession } from './entity/user-session.entity';
import { PaymentType } from './entity/payment-type.entity';
import { AnprCapture } from './entity/anpr-capture.entity';
import { VehicleRecord } from './entity/vehicle-record.entity';
import { RopVerification } from './entity/rop-verification.entity';
import { UserLineMapping } from './entity/user-line-mapping.entity';
import { AdminPcLineMapping } from './entity/admin-pc-line-mapping.entity';

dotenv.config();

const databaseOptions = buildDatabaseOptions();

export const AppDataSource = new DataSource({
  ...databaseOptions,
  entities: [
    User,
    UserLineMapping,
    Permission,
    Role,
    UserSession,
    Vehicle,
    Test,
    Centre,
    Line,
    AdminPc,
    AdminPcLineMapping,
    Camera,
    Payments,
    AnprCapture,
    RopVerification,
    Customer,
    VehicleRecord,
    Job,
    Appointment,
    Charge,
    ChargeCategory,
    PaymentType,
  ],
  migrations: [__dirname + '/../../migrations/*{.ts,.js}'],
  subscribers: [],
});
