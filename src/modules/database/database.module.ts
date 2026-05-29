import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import databaseConfig, { DatabaseConfig } from './database.config';
import { User } from './entity/user.entity';
import { Role } from './entity/role.entity';
import { UserSession } from './entity/user-session.entity';
import { Vehicle } from './entity/vehicle.entity';
import { Test } from './entity/test.entity';
import { Centre } from './entity/centre.entity';
import { Line } from './entity/line.entity';
import { AdminPc } from './entity/admin-pc.entity';
import { Camera } from './entity/camera.entity';
import { Payment } from './entity/payment.entity';
import { AnprCapture } from './entity/anpr-capture.entity';
import { RopVerification } from './entity/rop-verification.entity';
import { Customer } from './entity/customer.entity';
import { VehicleRecord } from './entity/vehicle-record.entity';
import { Job } from './entity/job.entity';
import { Appointment } from './entity/appointment.entity';
import { PaymentTransaction } from './entity/payment-transaction.entity';
import { UsersDao } from './dao/users.dao';
import { RolesDao } from './dao/roles.dao';
import { UserSessionsDao } from './dao/user-sessions.dao';
import { VehicleDao } from './dao/vehicle.dao';
import { TestDao } from './dao/test.dao';
import { CentreDao } from './dao/centre.dao';
import { LineDao } from './dao/line.dao';
import { AdminPcDao } from './dao/admin-pc.dao';
import { CameraDao } from './dao/camera.dao';
import { PaymentDao } from './dao/payment.dao';
import { AnprCaptureDao } from './dao/anpr-capture.dao';
import { RopVerificationDao } from './dao/rop-verification.dao';
import { CustomerDao } from './dao/customer.dao';
import { VehicleRecordDao } from './dao/vehicle-record.dao';
import { JobDao } from './dao/job.dao';
import { AppointmentDao } from './dao/appointment.dao';
import { PaymentTransactionDao } from './dao/payment-transaction.dao';

@Global()
@Module({
  imports: [
    ConfigModule.forFeature(databaseConfig),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const dbConfig = configService.get<DatabaseConfig>('database')!;
        return {
          ...dbConfig,
          autoLoadEntities: true,
        };
      },
    }),
    TypeOrmModule.forFeature([
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
    ]),
  ],
  providers: [
    UsersDao,
    RolesDao,
    UserSessionsDao,
    VehicleDao,
    TestDao,
    CentreDao,
    LineDao,
    AdminPcDao,
    CameraDao,
    PaymentDao,
    AnprCaptureDao,
    RopVerificationDao,
    CustomerDao,
    VehicleRecordDao,
    JobDao,
    AppointmentDao,
    PaymentTransactionDao,
  ],
  exports: [
    TypeOrmModule,
    UsersDao,
    RolesDao,
    UserSessionsDao,
    VehicleDao,
    TestDao,
    CentreDao,
    LineDao,
    AdminPcDao,
    CameraDao,
    PaymentDao,
    AnprCaptureDao,
    RopVerificationDao,
    CustomerDao,
    VehicleRecordDao,
    JobDao,
    AppointmentDao,
    PaymentTransactionDao,
  ],
})
export class DatabaseModule {}
