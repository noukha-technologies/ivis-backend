import { Job } from './entity/job.entity';
import { JobImage } from './entity/job-image.entity';
import { User } from './entity/user.entity';
import { Test } from './entity/test.entity';
import { Role } from './entity/role.entity';
import { Line } from './entity/line.entity';
import { Charge } from './entity/charge.entity';
import { Camera } from './entity/camera.entity';
import { CameraLineMapping } from './entity/camera-line-mapping.entity';
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
import { ChargeCategory } from './entity/charge-category.entity';
import { Configurations } from './entity/configuration.entity';
import { RopVerification } from './entity/rop-verification.entity';
import { UserLineMapping } from './entity/user-line-mapping.entity';
import { AdminPcLineMapping } from './entity/admin-pc-line-mapping.entity';
import { RoleCentreMapping } from './entity/role-centre-mapping.entity';
import { OnboardingStatus } from './entity/onboarding-status.entity';
import { SyncRunLog } from './entity/sync-run-log.entity';
import { CentreApiKey } from './entity/centre-api-key.entity';
import { AuditLog } from './entity/audit-log.entity';

// Single source of truth for "every entity in the app" — shared by the
// migration CLI's AppDataSource and anything else that needs an explicit
// entities array (the app's default NestJS connection uses
// autoLoadEntities instead, but this list must still be kept exhaustive so
// standalone DataSource usages never drift out of sync with it).
export const APP_ENTITIES = [
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
  Charge,
  ChargeCategory,
  PaymentType,
  Configurations,
  OnboardingStatus,
  RoleCentreMapping,
  SyncRunLog,
  CentreApiKey,
  AuditLog,
];

export const APP_MIGRATIONS_GLOB = [__dirname + '/../../migrations/*{.ts,.js}'];

export function buildAppDataSourceOptions() {
  return {
    entities: APP_ENTITIES,
    migrations: APP_MIGRATIONS_GLOB,
    subscribers: [],
  };
}
