import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import databaseConfig, { DatabaseConfig } from './database.config';
import centralDatabaseConfig, {
  CentralDatabaseConfig,
} from './central-database.config';
import { CENTRAL_DATA_SOURCE } from './central-data-source.token';

import { Job } from './entity/job.entity';
import { User } from './entity/user.entity';
import { Role } from './entity/role.entity';
import { Test } from './entity/test.entity';
import { Line } from './entity/line.entity';
import { Camera } from './entity/camera.entity';
import { Centre } from './entity/centre.entity';
import { Charge } from './entity/charge.entity';
import { ChargeCategory } from './entity/charge-category.entity';
import { Vehicle } from './entity/vehicle.entity';
import { AdminPc } from './entity/admin-pc.entity';
import { Customer } from './entity/customer.entity';
import { Payments } from './entity/payments.entity';
import { Permission } from './entity/permission.entity';
import { Appointment } from './entity/appointment.entity';
import { UserSession } from './entity/user-session.entity';
import { AnprCapture } from './entity/anpr-capture.entity';
import { PaymentType } from './entity/payment-type.entity';
import { VehicleRecord } from './entity/vehicle-record.entity';
import { RopVerification } from './entity/rop-verification.entity';
import { UserLineMapping } from './entity/user-line-mapping.entity';
import { AdminPcLineMapping } from './entity/admin-pc-line-mapping.entity';
import { CameraLineMapping } from './entity/camera-line-mapping.entity';
import { Configurations } from './entity/configuration.entity';
import { OnboardingStatus } from './entity/onboarding-status.entity';

import { JobDao } from './dao/job.dao';
import { RoleDao } from './dao/role.dao';
import { TestDao } from './dao/test.dao';
import { LineDao } from './dao/line.dao';
import { UsersDao } from './dao/users.dao';
import { CentreDao } from './dao/centre.dao';
import { ChargeDao } from './dao/charge.dao';
import { ChargeCategoryDao } from './dao/charge-category.dao';
import { CameraDao } from './dao/camera.dao';
import { VehicleDao } from './dao/vehicle.dao';
import { AdminPcDao } from './dao/admin-pc.dao';
import { PaymentsDao } from './dao/payments.dao';
import { CustomerDao } from './dao/customer.dao';
import { PermissionDao } from './dao/permission.dao';
import { AppointmentDao } from './dao/appointment.dao';
import { PaymentTypeDao } from './dao/payment-type.dao';
import { AnprCaptureDao } from './dao/anpr-capture.dao';
import { UserSessionsDao } from './dao/user-sessions.dao';
import { VehicleRecordDao } from './dao/vehicle-record.dao';
import { RopVerificationDao } from './dao/rop-verification.dao';
import { UserLineMappingDao } from './dao/user-line-mapping.dao';
import { AdminPcLineMappingDao } from './dao/admin-pc-line-mapping.dao';
import { CameraLineMappingDao } from './dao/camera-line-mapping.dao';
import { ConfigurationDao } from './dao/configuration.dao';
import { OnboardingStatusDao } from './dao/onboarding-status.dao';
import { SchemaBootstrapService } from './service/schema-bootstrap.service';

// Entities synced from the Master DB during Onboarding Sync — the 'central'
// connection is read-only (enforced by the CENTRAL_DB_* Postgres role) and
// only ever registers this centre-scoped subset, never the full entity list.
const CENTRAL_SYNC_ENTITIES = [
  Centre,
  Line,
  Camera,
  CameraLineMapping,
  AdminPc,
  AdminPcLineMapping,
  Charge,
  ChargeCategory,
  Configurations,
  Role,
  Permission,
  User,
  UserLineMapping,
];

@Global()
@Module({
  imports: [
    ConfigModule.forFeature(databaseConfig),
    ConfigModule.forFeature(centralDatabaseConfig),
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
      CameraLineMapping,
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
      Configurations,
      OnboardingStatus,
    ]),
  ],
  providers: [
    // Lazy, connect-on-demand DataSource for the Master DB — deliberately NOT
    // a TypeOrmModule.forRootAsync('central', ...) connection. That form
    // connects eagerly at Nest bootstrap and, on failure, crashes the WHOLE
    // app (all modules, all already-onboarded centres) after retrying —
    // defeating "central DB down should never affect an already-COMPLETED
    // centre server". Constructing (not initializing) a DataSource here is
    // free; CentralSyncReaderService connects it lazily on first real use
    // and surfaces failures as a catchable error (-> CENTRAL_DB_UNAVAILABLE).
    {
      provide: CENTRAL_DATA_SOURCE,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const centralConfig =
          configService.get<CentralDatabaseConfig>('centralDatabase')!;
        return new DataSource({
          ...centralConfig,
          entities: CENTRAL_SYNC_ENTITIES,
        });
      },
    },
    UsersDao,
    UserLineMappingDao,
    PermissionDao,
    RoleDao,
    UserSessionsDao,
    VehicleDao,
    TestDao,
    CentreDao,
    LineDao,
    AdminPcDao,
    AdminPcLineMappingDao,
    CameraDao,
    CameraLineMappingDao,
    PaymentsDao,
    AnprCaptureDao,
    RopVerificationDao,
    CustomerDao,
    VehicleRecordDao,
    JobDao,
    AppointmentDao,
    ChargeDao,
    ChargeCategoryDao,
    PaymentTypeDao,
    ConfigurationDao,
    OnboardingStatusDao,
    SchemaBootstrapService,
  ],
  exports: [
    TypeOrmModule,
    CENTRAL_DATA_SOURCE,
    UsersDao,
    UserLineMappingDao,
    PermissionDao,
    RoleDao,
    UserSessionsDao,
    VehicleDao,
    TestDao,
    CentreDao,
    LineDao,
    AdminPcDao,
    AdminPcLineMappingDao,
    CameraDao,
    CameraLineMappingDao,
    PaymentsDao,
    AnprCaptureDao,
    RopVerificationDao,
    CustomerDao,
    VehicleRecordDao,
    JobDao,
    AppointmentDao,
    ChargeDao,
    ChargeCategoryDao,
    PaymentTypeDao,
    ConfigurationDao,
    OnboardingStatusDao,
    SchemaBootstrapService,
  ],
})
export class DatabaseModule {}
