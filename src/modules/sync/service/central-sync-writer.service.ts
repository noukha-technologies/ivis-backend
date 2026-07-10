import { Injectable } from '@nestjs/common';
import { DataSource, ObjectLiteral } from 'typeorm';

import { buildCentralWriteDatabaseOptions } from '../../database/central-write-database.config';
import { upsertWithUpdate } from '../../../common/utils/conditional-upsert.util';

import { Line } from '../../database/entity/line.entity';
import { Camera } from '../../database/entity/camera.entity';
import { CameraLineMapping } from '../../database/entity/camera-line-mapping.entity';
import { AdminPc } from '../../database/entity/admin-pc.entity';
import { AdminPcLineMapping } from '../../database/entity/admin-pc-line-mapping.entity';
import { Charge } from '../../database/entity/charge.entity';
import { ChargeCategory } from '../../database/entity/charge-category.entity';
import { User } from '../../database/entity/user.entity';
import { UserLineMapping } from '../../database/entity/user-line-mapping.entity';
import { Customer } from '../../database/entity/customer.entity';
import { VehicleRecord } from '../../database/entity/vehicle-record.entity';
import { AnprCapture } from '../../database/entity/anpr-capture.entity';
import { RopVerification } from '../../database/entity/rop-verification.entity';
import { Appointment } from '../../database/entity/appointment.entity';
import { Job } from '../../database/entity/job.entity';
import { Payments } from '../../database/entity/payments.entity';
import { Centre } from '../../database/entity/centre.entity';
import { Role } from '../../database/entity/role.entity';
import { PaymentType } from '../../database/entity/payment-type.entity';
import { Vehicle } from '../../database/entity/vehicle.entity';
import { Permission } from '../../database/entity/permission.entity';
import { RoleCentreMapping } from '../../database/entity/role-centre-mapping.entity';

// Every entity this connection is ever allowed to WRITE — bucket B (pure
// transactional, push-only) + bucket C (bidirectional). This connection's
// Postgres role should be infra-scoped to match (see
// central-write-database.config.ts) — .upsert() below is only ever called
// with one of these entity classes, so that boundary holds regardless of
// what else is registered on the DataSource.
const WRITABLE_ENTITIES = [
  // Bucket C
  Line,
  Camera,
  CameraLineMapping,
  AdminPc,
  AdminPcLineMapping,
  Charge,
  ChargeCategory,
  User,
  UserLineMapping,
  // Bucket B
  Customer,
  VehicleRecord,
  AnprCapture,
  RopVerification,
  Appointment,
  Job,
  Payments,
];

// Bucket-A entities reachable, directly or transitively, from
// WRITABLE_ENTITIES' relations — concretely: User→Role→Permission,
// Role→RoleCentreMapping→Centre; {Line,Charge,AdminPc,User,Job,Payments,
// Appointment}→Centre; Payments→PaymentType; VehicleRecord→Vehicle. TypeORM
// walks the FULL relation graph reachable from any registered entity and
// needs every target's metadata registered on the same DataSource to
// resolve it at all — even for a plain upsert that never touches the
// relation's own column — or it throws "Entity metadata for X#relation was
// not found" before any SQL even runs (confirmed the hard way: fixing one
// hop at a time surfaced Centre, then Role, then Permission/
// RoleCentreMapping — this list is the closure, not just the direct
// targets). Registered here for METADATA RESOLUTION ONLY: `.upsert()` is
// never called with one of these, so this does not widen what this
// connection actually writes — see WRITABLE_ENTITIES above for the real
// write boundary.
const RELATION_TARGET_ONLY_ENTITIES = [
  Centre,
  Role,
  PaymentType,
  Vehicle,
  Permission,
  RoleCentreMapping,
];

/**
 * Writable connection into the central Master Database — used ONLY by
 * Database Sync's push phase (bucket B/C). Deliberately separate from
 * CentralSyncReaderService (Onboarding Sync's read-only reader,
 * CENTRAL_DATA_SOURCE). Lazily constructed AND lazily connected — see
 * central-write-database.config.ts for why this must never resolve its
 * config eagerly at app boot.
 */
@Injectable()
export class CentralSyncWriterService {
  private dataSource: DataSource | null = null;

  private async ensureConnected(): Promise<DataSource> {
    if (!this.dataSource) {
      this.dataSource = new DataSource({
        ...buildCentralWriteDatabaseOptions(),
        entities: [...WRITABLE_ENTITIES, ...RELATION_TARGET_ONLY_ENTITIES],
      });
    }
    if (!this.dataSource.isInitialized) {
      await this.dataSource.initialize();
    }
    return this.dataSource;
  }

  /**
   * Upsert rows of one entity type into the central DB.
   * `conditional: true` (bucket C) → most-recent-`updated_at`-wins, a no-op
   * if central's copy is already newer. `conditional: false` (bucket B) →
   * plain overwrite — bucket B has no conflicts by construction (central
   * never edits transactional data back down), so there's nothing to
   * compare against.
   */
  async upsert<T extends ObjectLiteral>(
    entity: { new (): T },
    rows: T[],
    options: { conditional: boolean },
  ): Promise<number> {
    if (!rows.length) return 0;
    const dataSource = await this.ensureConnected();
    return upsertWithUpdate(dataSource.manager, entity, rows, options);
  }
}
