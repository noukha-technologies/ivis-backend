import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import databaseConfig, { DatabaseConfig } from './database.config';

import { Job } from './entity/job.entity';
import { JobImage } from './entity/job-image.entity';
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
import { AppointmentBooking } from './entity/appointment-booking.entity';
import { TajdeedOutbox } from './entity/tajdeed-outbox.entity';
import { UserSession } from './entity/user-session.entity';
import { AnprCapture } from './entity/anpr-capture.entity';
import { PaymentType } from './entity/payment-type.entity';
import { VehicleRecord } from './entity/vehicle-record.entity';
import { RopVerification } from './entity/rop-verification.entity';
import { UserLineMapping } from './entity/user-line-mapping.entity';
import { AdminPcLineMapping } from './entity/admin-pc-line-mapping.entity';
import { CameraLineMapping } from './entity/camera-line-mapping.entity';
import { RoleCentreMapping } from './entity/role-centre-mapping.entity';
import { Configurations } from './entity/configuration.entity';
import { OnboardingStatus } from './entity/onboarding-status.entity';
import { SyncRunLog } from './entity/sync-run-log.entity';
import { CentreApiKey } from './entity/centre-api-key.entity';
import { AuditLog } from './entity/audit-log.entity';

import { JobDao } from './dao/job.dao';
import { JobImageDao } from './dao/job-image.dao';
import { DashboardDao } from './dao/dashboard.dao';
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
import { AppointmentBookingDao } from './dao/appointment-booking.dao';
import { TajdeedOutboxDao } from './dao/tajdeed-outbox.dao';
import { PaymentTypeDao } from './dao/payment-type.dao';
import { AnprCaptureDao } from './dao/anpr-capture.dao';
import { UserSessionsDao } from './dao/user-sessions.dao';
import { VehicleRecordDao } from './dao/vehicle-record.dao';
import { RopVerificationDao } from './dao/rop-verification.dao';
import { UserLineMappingDao } from './dao/user-line-mapping.dao';
import { AdminPcLineMappingDao } from './dao/admin-pc-line-mapping.dao';
import { CameraLineMappingDao } from './dao/camera-line-mapping.dao';
import { RoleCentreMappingDao } from './dao/role-centre-mapping.dao';
import { ConfigurationDao } from './dao/configuration.dao';
import { OnboardingStatusDao } from './dao/onboarding-status.dao';
import { SyncRunLogDao } from './dao/sync-run-log.dao';
import { CentreApiKeyDao } from './dao/centre-api-key.dao';
import { AuditLogDao } from './dao/audit-log.dao';
import { AuditLogSubscriber } from './subscribers/audit-log.subscriber';
import { SchemaBootstrapService } from './service/schema-bootstrap.service';

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
      dataSourceFactory: async (options) => {
        const dataSource = new DataSource(options!);
        await dataSource.initialize();
        await dataSource.query(`SET TIME ZONE 'UTC'`);
        return dataSource;
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
      JobImage,
      Appointment,
      AppointmentBooking,
      TajdeedOutbox,
      Charge,
      ChargeCategory,
      PaymentType,
      Configurations,
      OnboardingStatus,
      RoleCentreMapping,
      SyncRunLog,
      CentreApiKey,
      AuditLog,
    ]),
  ],
  providers: [
    UsersDao,
    UserLineMappingDao,
    PermissionDao,
    RoleDao,
    RoleCentreMappingDao,
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
    JobImageDao,
    DashboardDao,
    AppointmentDao,
    AppointmentBookingDao,
    TajdeedOutboxDao,
    ChargeDao,
    ChargeCategoryDao,
    PaymentTypeDao,
    ConfigurationDao,
    OnboardingStatusDao,
    SyncRunLogDao,
    CentreApiKeyDao,
    AuditLogDao,
    AuditLogSubscriber,
    SchemaBootstrapService,
  ],
  exports: [
    TypeOrmModule,
    UsersDao,
    UserLineMappingDao,
    PermissionDao,
    RoleDao,
    RoleCentreMappingDao,
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
    JobImageDao,
    DashboardDao,
    AppointmentDao,
    AppointmentBookingDao,
    TajdeedOutboxDao,
    ChargeDao,
    ChargeCategoryDao,
    PaymentTypeDao,
    ConfigurationDao,
    OnboardingStatusDao,
    SyncRunLogDao,
    CentreApiKeyDao,
    AuditLogDao,
    SchemaBootstrapService,
  ],
})
export class DatabaseModule {}
