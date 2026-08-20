import { DataSource, EntityTarget, ObjectLiteral } from 'typeorm';

import { Centre } from '../database/entity/centre.entity';
import { Role } from '../database/entity/role.entity';
import { Permission } from '../database/entity/permission.entity';
import { RoleCentreMapping } from '../database/entity/role-centre-mapping.entity';
import { PaymentType } from '../database/entity/payment-type.entity';
import { Test } from '../database/entity/test.entity';
import { Vehicle } from '../database/entity/vehicle.entity';
import { Line } from '../database/entity/line.entity';
import { Camera } from '../database/entity/camera.entity';
import { CameraLineMapping } from '../database/entity/camera-line-mapping.entity';
import { AdminPc } from '../database/entity/admin-pc.entity';
import { AdminPcLineMapping } from '../database/entity/admin-pc-line-mapping.entity';
import { Charge } from '../database/entity/charge.entity';
import { ChargeCategory } from '../database/entity/charge-category.entity';
import { User } from '../database/entity/user.entity';
import { UserLineMapping } from '../database/entity/user-line-mapping.entity';
import { Customer } from '../database/entity/customer.entity';
import { VehicleRecord } from '../database/entity/vehicle-record.entity';
import { AnprCapture } from '../database/entity/anpr-capture.entity';
import { RopVerification } from '../database/entity/rop-verification.entity';
import { Appointment } from '../database/entity/appointment.entity';
import { Job } from '../database/entity/job.entity';
import { Payments } from '../database/entity/payments.entity';
import { Configurations } from '../database/entity/configuration.entity';
import { TajdeedOutbox } from '../database/entity/tajdeed-outbox.entity';

export const SYNC_DIRECTION_VALUES = [
  'READ_ONLY',
  'WRITE_ONLY',
  'BIDIRECTIONAL',
  'NOT_SYNCED',
] as const;
export type SyncDirection = (typeof SYNC_DIRECTION_VALUES)[number];

export const CHUNK_SIZE = 500;

/**
 * Bridges an entity key to a real TypeORM class + the actual chunked-fetch
 * logic — see Database_sync_arch_replan.md §3a/§6. `direction` replaces the
 * old sync_entity_config DB table entirely: this is now a plain, hardcoded,
 * backend-only decision (no admin UI, no per-row config), per the confirmed
 * design decision to keep entity classification out of the database.
 *
 * `pull` runs on the CENTRAL node (this node owns the data) — returns up to
 * CHUNK_SIZE rows for one centre, strictly newer than the cursor, ordered by
 * updated_at so cursor-based pagination is stable.
 *
 * `pushWhere` runs on the CENTRAL node too, but describes how to match rows
 * a centre is pushing UP — used only to decide the upsert's conflict/scope,
 * not to fetch (the centre sends the rows; central just needs to know which
 * of its own local rows it's allowed to touch for this entity/centre).
 */
export interface SyncEntityDefinition {
  entityKey: string;
  entityClass: EntityTarget<ObjectLiteral>;
  direction: SyncDirection;
  /** true = most-recent-updated_at-wins (bucket C); false = blind overwrite (bucket A) or no-conflict (bucket B). */
  conditional: boolean;
  /** Central-side: fetch up to CHUNK_SIZE rows for this centre, updated after cursor. Present for READ_ONLY/BIDIRECTIONAL only. */
  pull?: (
    dataSource: DataSource,
    centreId: string,
    cursor: Date,
  ) => Promise<ObjectLiteral[]>;
  /**
   * Centre-side: fetch up to CHUNK_SIZE local rows updated after cursor, to
   * push up. No centre filter needed — a centre's own local DB only ever
   * holds that one centre's rows for every WRITE_ONLY/BIDIRECTIONAL entity
   * (this is a single-tenant local box, unlike central). Present for
   * WRITE_ONLY/BIDIRECTIONAL only.
   */
  pushLocal?: (
    dataSource: DataSource,
    cursor: Date,
  ) => Promise<ObjectLiteral[]>;
  /** Non-PK conflict target for upsert (e.g. RoleCentreMapping's (role_id, centre_id) partial unique index). */
  conflictColumns?: string[];
  conflictIndexPredicate?: string;
  /**
   * Columns the pull phase must leave alone on an existing local row, because
   * the centre owns them and central holds null. Without this a READ_ONLY
   * entity's blind overwrite would erase local-only state on every run.
   */
  localOnlyColumns?: string[];
  /**
   * Per-box sequence columns (`<name>_id`) — minted locally on insert rather
   * than taken from the sender. See localSequenceColumns in the upsert util
   * for why no ON CONFLICT target can substitute for this.
   */
  localSequenceColumns?: string[];
}

async function pullSimple<T extends ObjectLiteral>(
  dataSource: DataSource,
  entity: EntityTarget<T>,
  centreColumn: string,
  centreId: string,
  cursor: Date,
): Promise<T[]> {
  return dataSource
    .getRepository(entity)
    .createQueryBuilder('e')
    .where(`e.${centreColumn} = :centreId`, { centreId })
    .andWhere('e.updated_at > :cursor', { cursor })
    .orderBy('e.updated_at', 'ASC')
    .limit(CHUNK_SIZE)
    .getMany();
}

async function pullGlobal<T extends ObjectLiteral>(
  dataSource: DataSource,
  entity: EntityTarget<T>,
  cursor: Date,
): Promise<T[]> {
  return dataSource
    .getRepository(entity)
    .createQueryBuilder('e')
    .where('e.updated_at > :cursor', { cursor })
    .orderBy('e.updated_at', 'ASC')
    .limit(CHUNK_SIZE)
    .getMany();
}

export const SYNC_ENTITY_MAP: Record<string, SyncEntityDefinition> = {
  // ─── Bucket A — READ_ONLY (central → centre, central always wins) ──────
  Centre: {
    entityKey: 'Centre',
    entityClass: Centre,
    direction: 'READ_ONLY',
    conditional: false,
    // `centre_id` is minted here by MAX(...)+1 and still carries a global unique
    // index, so a row inserted from the other side brings a number some local
    // row already holds. The conflict target stays `id` — these are
    // centre-scoped, and matching on the number would merge one centre's
    // record with another's that happens to share it.
    localSequenceColumns: ['centre_id'],
    // The centre's own sync credential lives on this row and central holds
    // null for it, so a blind READ_ONLY overwrite would lock the centre out
    // of the very next run.
    localOnlyColumns: ['sync_api_key'],
    pull: async (ds, centreId, cursor) =>
      ds
        .getRepository(Centre)
        .createQueryBuilder('e')
        .where('e.id = :centreId', { centreId })
        .andWhere('e.updated_at > :cursor', { cursor })
        .limit(CHUNK_SIZE)
        .getMany(),
  },
  Role: {
    entityKey: 'Role',
    entityClass: Role,
    direction: 'READ_ONLY',
    conditional: false,
    pull: async (ds, centreId, cursor) =>
      ds
        .getRepository(Role)
        .createQueryBuilder('e')
        .innerJoin(
          RoleCentreMapping,
          'rcm',
          'rcm.role_id = e.id AND rcm.centre_id = :centreId AND rcm.is_deleted = false',
          { centreId },
        )
        .andWhere('e.updated_at > :cursor', { cursor })
        .orderBy('e.updated_at', 'ASC')
        .limit(CHUNK_SIZE)
        .getMany(),
  },
  Permission: {
    entityKey: 'Permission',
    entityClass: Permission,
    direction: 'READ_ONLY',
    conditional: false,
    // Matched on its business key, not on `id`.
    //
    // Every box mints its own snowflake PKs and its own sequential
    // <name>_id, so the same logical master row exists on central and here
    // under two different PKs. ON CONFLICT (id) then saw no conflict, tried
    // to INSERT, and hit the unique index on the business key instead —
    // "duplicate key value violates unique constraint". Targeting that key
    // makes the pull adopt the local row and update it in place; the util
    // keeps the local `id` and the key itself out of the UPDATE, so nothing
    // that already references this row breaks.
    conflictColumns: ['name'],
    // Global, no centre scoping — every centre pulls the full permission set.
    pull: async (ds, _centreId, cursor) => pullGlobal(ds, Permission, cursor),
  },
  RoleCentreMapping: {
    entityKey: 'RoleCentreMapping',
    entityClass: RoleCentreMapping,
    direction: 'READ_ONLY',
    conditional: false,
    conflictColumns: ['role_id', 'centre_id'],
    conflictIndexPredicate: 'is_deleted = false',
    pull: async (ds, centreId, cursor) =>
      pullSimple(ds, RoleCentreMapping, 'centre_id', centreId, cursor),
  },
  PaymentType: {
    entityKey: 'PaymentType',
    entityClass: PaymentType,
    direction: 'READ_ONLY',
    conditional: false,
    // Matched on `code`, and the local sequence is left alone.
    //
    // Three ids describe one of these rows and only one of them is portable:
    //   - `id`          snowflake, minted per box       → differs
    //   - `<name>_id`   MAX(...)+1 per box              → differs
    //   - `code`        authored once, shared by all    → stable
    //
    // Conflicting on either of the first two means Postgres finds no match,
    // INSERTs, and then trips the unique index on `code` for a row that
    // already exists. Conflicting on `code` finds the local row and updates
    // it — but the UPDATE must not carry central's `<name>_id` down, or that
    // number collides with whichever local row already holds it. The util
    // keeps `id` and the conflict target out of the UPDATE; localOnlyColumns
    // keeps the sequence out too.
    conflictColumns: ['code'],
    localSequenceColumns: ['payment_type_id'],
    // The `code` index is PARTIAL — `... ("code") WHERE is_deleted = false`,
    // so a code can be reused once its owning row is soft-deleted. ON CONFLICT
    // only matches an index whose predicate it repeats, so without this the
    // statement fails with "no unique or exclusion constraint matching the
    // ON CONFLICT specification" even though the index plainly exists.
    conflictIndexPredicate: 'is_deleted = false',
    pull: async (ds, _centreId, cursor) => pullGlobal(ds, PaymentType, cursor),
  },
  Test: {
    entityKey: 'Test',
    entityClass: Test,
    direction: 'READ_ONLY',
    conditional: false,
    // Matched on `code`, and the local sequence is left alone.
    //
    // Three ids describe one of these rows and only one of them is portable:
    //   - `id`          snowflake, minted per box       → differs
    //   - `<name>_id`   MAX(...)+1 per box              → differs
    //   - `code`        authored once, shared by all    → stable
    //
    // Conflicting on either of the first two means Postgres finds no match,
    // INSERTs, and then trips the unique index on `code` for a row that
    // already exists. Conflicting on `code` finds the local row and updates
    // it — but the UPDATE must not carry central's `<name>_id` down, or that
    // number collides with whichever local row already holds it. The util
    // keeps `id` and the conflict target out of the UPDATE; localOnlyColumns
    // keeps the sequence out too.
    conflictColumns: ['code'],
    localSequenceColumns: ['test_id'],
    // The `code` index is PARTIAL — `... ("code") WHERE is_deleted = false`,
    // so a code can be reused once its owning row is soft-deleted. ON CONFLICT
    // only matches an index whose predicate it repeats, so without this the
    // statement fails with "no unique or exclusion constraint matching the
    // ON CONFLICT specification" even though the index plainly exists.
    conflictIndexPredicate: 'is_deleted = false',
    pull: async (ds, _centreId, cursor) => pullGlobal(ds, Test, cursor),
  },
  Vehicle: {
    entityKey: 'Vehicle',
    entityClass: Vehicle,
    direction: 'READ_ONLY',
    conditional: false,
    // Matched on `code`, and the local sequence is left alone.
    //
    // Three ids describe one of these rows and only one of them is portable:
    //   - `id`          snowflake, minted per box       → differs
    //   - `<name>_id`   MAX(...)+1 per box              → differs
    //   - `code`        authored once, shared by all    → stable
    //
    // Conflicting on either of the first two means Postgres finds no match,
    // INSERTs, and then trips the unique index on `code` for a row that
    // already exists. Conflicting on `code` finds the local row and updates
    // it — but the UPDATE must not carry central's `<name>_id` down, or that
    // number collides with whichever local row already holds it. The util
    // keeps `id` and the conflict target out of the UPDATE; localOnlyColumns
    // keeps the sequence out too.
    conflictColumns: ['code'],
    localSequenceColumns: ['vehicle_id'],
    // The `code` index is PARTIAL — `... ("code") WHERE is_deleted = false`,
    // so a code can be reused once its owning row is soft-deleted. ON CONFLICT
    // only matches an index whose predicate it repeats, so without this the
    // statement fails with "no unique or exclusion constraint matching the
    // ON CONFLICT specification" even though the index plainly exists.
    conflictIndexPredicate: 'is_deleted = false',
    pull: async (ds, _centreId, cursor) => pullGlobal(ds, Vehicle, cursor),
  },

  ChargeCategory: {
    entityKey: 'ChargeCategory',
    entityClass: ChargeCategory,
    // Central-owned, like every other shared master.
    //
    // Was BIDIRECTIONAL, and it was the only entity that was both pushed AND
    // global — so one centre editing a category rewrote it for every other
    // centre on their next pull, with nothing on screen to say where the change
    // came from. Categories are a shared pricing vocabulary; they belong to
    // central for the same reason Vehicle and Test do.
    //
    // NOTE: charges.charge_category_id has a hard FK to this table. Because
    // categories no longer travel upward, a category created locally would
    // never reach central, and the next push of a Charge referencing it would
    // fail the FK there. Creating categories at a centre must therefore be
    // blocked in the UI/API, not merely discouraged.
    direction: 'READ_ONLY',
    conditional: false,
    // Matched on its business key, not on `id`.
    //
    // Every box mints its own snowflake PKs and its own sequential
    // <name>_id, so the same logical master row exists on central and here
    // under two different PKs. ON CONFLICT (id) then saw no conflict, tried
    // to INSERT, and hit the unique index on the business key instead —
    // "duplicate key value violates unique constraint". Targeting that key
    // makes the pull adopt the local row and update it in place; the util
    // keeps the local `id` and the key itself out of the UPDATE, so nothing
    // that already references this row breaks.
    conflictColumns: ['category_id'],
    // Global (no centre_id) — every centre sees the same category list.
    pull: async (ds, _centreId, cursor) =>
      pullGlobal(ds, ChargeCategory, cursor),
  },

  // ─── Bucket C — BIDIRECTIONAL (most-recent-updated_at-wins) ─────────────
  Line: {
    entityKey: 'Line',
    entityClass: Line,
    direction: 'BIDIRECTIONAL',
    conditional: true,
    // `line_id` is minted here by MAX(...)+1 and still carries a global unique
    // index, so a row inserted from the other side brings a number some local
    // row already holds. The conflict target stays `id` — these are
    // centre-scoped, and matching on the number would merge one centre's
    // record with another's that happens to share it.
    localSequenceColumns: ['line_id'],
    pull: async (ds, centreId, cursor) =>
      pullSimple(ds, Line, 'centre_id', centreId, cursor),
    pushLocal: async (ds, cursor) => pullGlobal(ds, Line, cursor),
  },
  Camera: {
    entityKey: 'Camera',
    entityClass: Camera,
    direction: 'BIDIRECTIONAL',
    conditional: true,
    // `camera_id` is minted here by MAX(...)+1 and still carries a global unique
    // index, so a row inserted from the other side brings a number some local
    // row already holds. The conflict target stays `id` — these are
    // centre-scoped, and matching on the number would merge one centre's
    // record with another's that happens to share it.
    localSequenceColumns: ['camera_id'],
    // Camera has no centre_id of its own — scoped via CameraLineMapping -> Line.centre_id.
    pull: async (ds, centreId, cursor) =>
      ds
        .getRepository(Camera)
        .createQueryBuilder('e')
        .innerJoin(
          CameraLineMapping,
          'clm',
          'clm.camera_id = e.id AND clm.is_deleted = false',
        )
        .innerJoin(
          Line,
          'l',
          'l.id = clm.line_id AND l.centre_id = :centreId',
          { centreId },
        )
        .andWhere('e.updated_at > :cursor', { cursor })
        .orderBy('e.updated_at', 'ASC')
        .limit(CHUNK_SIZE)
        .getMany(),
    pushLocal: async (ds, cursor) => pullGlobal(ds, Camera, cursor),
  },
  CameraLineMapping: {
    entityKey: 'CameraLineMapping',
    entityClass: CameraLineMapping,
    direction: 'BIDIRECTIONAL',
    conditional: true,
    pull: async (ds, centreId, cursor) =>
      ds
        .getRepository(CameraLineMapping)
        .createQueryBuilder('e')
        .innerJoin(Line, 'l', 'l.id = e.line_id AND l.centre_id = :centreId', {
          centreId,
        })
        .andWhere('e.updated_at > :cursor', { cursor })
        .orderBy('e.updated_at', 'ASC')
        .limit(CHUNK_SIZE)
        .getMany(),
    pushLocal: async (ds, cursor) => pullGlobal(ds, CameraLineMapping, cursor),
  },
  AdminPc: {
    entityKey: 'AdminPc',
    entityClass: AdminPc,
    direction: 'BIDIRECTIONAL',
    conditional: true,
    // `admin_pc_id` is minted here by MAX(...)+1 and still carries a global unique
    // index, so a row inserted from the other side brings a number some local
    // row already holds. The conflict target stays `id` — these are
    // centre-scoped, and matching on the number would merge one centre's
    // record with another's that happens to share it.
    localSequenceColumns: ['admin_pc_id'],
    pull: async (ds, centreId, cursor) =>
      pullSimple(ds, AdminPc, 'center_id', centreId, cursor),
    pushLocal: async (ds, cursor) => pullGlobal(ds, AdminPc, cursor),
  },
  AdminPcLineMapping: {
    entityKey: 'AdminPcLineMapping',
    entityClass: AdminPcLineMapping,
    direction: 'BIDIRECTIONAL',
    conditional: true,
    pull: async (ds, centreId, cursor) =>
      ds
        .getRepository(AdminPcLineMapping)
        .createQueryBuilder('e')
        .innerJoin(Line, 'l', 'l.id = e.line_id AND l.centre_id = :centreId', {
          centreId,
        })
        .andWhere('e.updated_at > :cursor', { cursor })
        .orderBy('e.updated_at', 'ASC')
        .limit(CHUNK_SIZE)
        .getMany(),
    pushLocal: async (ds, cursor) => pullGlobal(ds, AdminPcLineMapping, cursor),
  },
  Charge: {
    entityKey: 'Charge',
    entityClass: Charge,
    direction: 'BIDIRECTIONAL',
    conditional: true,
    // `charge_id` is minted here by MAX(...)+1 and still carries a global unique
    // index, so a row inserted from the other side brings a number some local
    // row already holds. The conflict target stays `id` — these are
    // centre-scoped, and matching on the number would merge one centre's
    // record with another's that happens to share it.
    localSequenceColumns: ['charge_id'],
    pull: async (ds, centreId, cursor) =>
      pullSimple(ds, Charge, 'centre_id', centreId, cursor),
    pushLocal: async (ds, cursor) => pullGlobal(ds, Charge, cursor),
  },
  User: {
    entityKey: 'User',
    entityClass: User,
    direction: 'BIDIRECTIONAL',
    conditional: true,
    // `user_id` is minted here by MAX(...)+1 and still carries a global unique
    // index, so a row inserted from the other side brings a number some local
    // row already holds. The conflict target stays `id` — these are
    // centre-scoped, and matching on the number would merge one centre's
    // record with another's that happens to share it.
    localSequenceColumns: ['user_id'],
    // User.password has select:false (excluded from plain queries so it
    // never leaks into normal API responses) — must be explicitly
    // .addSelect()'d here, or every synced User row lands locally with a
    // NULL password and can never log in locally afterward. The HASH
    // travels over the wire deliberately (bucket C, bidirectional) so a
    // centre can log a synced user in offline; this is unrelated to
    // verify-central's separate "never send a plaintext password" rule.
    pull: async (ds, centreId, cursor) =>
      ds
        .getRepository(User)
        .createQueryBuilder('e')
        .addSelect('e.password')
        .where('e.center_id = :centreId', { centreId })
        .andWhere('e.updated_at > :cursor', { cursor })
        .orderBy('e.updated_at', 'ASC')
        .limit(CHUNK_SIZE)
        .getMany(),
    // Excludes re-scoped Super Admin copies (requires_central_revalidation) —
    // that row shares the real central Super Admin's PK; pushing it would
    // corrupt their role_id/center_id centrally. See onboarding-central.service.ts.
    pushLocal: async (ds, cursor) =>
      ds
        .getRepository(User)
        .createQueryBuilder('e')
        .addSelect('e.password')
        .where('e.updated_at > :cursor', { cursor })
        .andWhere('e.requires_central_revalidation = false')
        .orderBy('e.updated_at', 'ASC')
        .limit(CHUNK_SIZE)
        .getMany(),
  },
  UserLineMapping: {
    entityKey: 'UserLineMapping',
    entityClass: UserLineMapping,
    direction: 'BIDIRECTIONAL',
    conditional: true,
    pull: async (ds, centreId, cursor) =>
      ds
        .getRepository(UserLineMapping)
        .createQueryBuilder('e')
        .innerJoin(Line, 'l', 'l.id = e.line_id AND l.centre_id = :centreId', {
          centreId,
        })
        .andWhere('e.updated_at > :cursor', { cursor })
        .orderBy('e.updated_at', 'ASC')
        .limit(CHUNK_SIZE)
        .getMany(),
    pushLocal: async (ds, cursor) => pullGlobal(ds, UserLineMapping, cursor),
  },

  // ─── Bucket B — WRITE_ONLY (centre → central, no conflict possible) ────
  Customer: {
    entityKey: 'Customer',
    entityClass: Customer,
    direction: 'WRITE_ONLY',
    conditional: false,
    pushLocal: async (ds, cursor) => pullGlobal(ds, Customer, cursor),
  },
  VehicleRecord: {
    entityKey: 'VehicleRecord',
    entityClass: VehicleRecord,
    direction: 'WRITE_ONLY',
    conditional: false,
    pushLocal: async (ds, cursor) => pullGlobal(ds, VehicleRecord, cursor),
  },
  AnprCapture: {
    entityKey: 'AnprCapture',
    entityClass: AnprCapture,
    direction: 'WRITE_ONLY',
    conditional: false,
    pushLocal: async (ds, cursor) => pullGlobal(ds, AnprCapture, cursor),
  },
  RopVerification: {
    entityKey: 'RopVerification',
    entityClass: RopVerification,
    direction: 'WRITE_ONLY',
    conditional: false,
    pushLocal: async (ds, cursor) => pullGlobal(ds, RopVerification, cursor),
  },
  Appointment: {
    entityKey: 'Appointment',
    entityClass: Appointment,
    direction: 'WRITE_ONLY',
    conditional: false,
    pushLocal: async (ds, cursor) => pullGlobal(ds, Appointment, cursor),
  },
  Job: {
    entityKey: 'Job',
    entityClass: Job,
    direction: 'WRITE_ONLY',
    conditional: false,
    pushLocal: async (ds, cursor) => pullGlobal(ds, Job, cursor),
  },
  Payments: {
    entityKey: 'Payments',
    entityClass: Payments,
    direction: 'WRITE_ONLY',
    conditional: false,
    pushLocal: async (ds, cursor) => pullGlobal(ds, Payments, cursor),
  },
  Configuration: {
    entityKey: 'Configuration',
    entityClass: Configurations,
    // Authored at the centre, never sent back down.
    //
    // WRITE_ONLY rather than BIDIRECTIONAL because this row decides how the
    // centre behaves — sync mode, working hours, auto-close, whether payment is
    // mandatory. A pull could hand central the ability to change those under a
    // running centre, including switching sync_mode itself. Central gets a
    // read-only copy for reporting; the centre stays the author.
    direction: 'WRITE_ONLY',
    conditional: false,
    // `configuration_id` is MAX(...)+1 per box, so EVERY centre's row is
    // number 1. Central's unique index on it would reject the second centre's
    // push, so central mints its own — see localSequenceColumns in the util.
    localSequenceColumns: ['configuration_id'],
    pushLocal: async (ds, cursor) => pullGlobal(ds, Configurations, cursor),
  },
  TajdeedOutbox: {
    entityKey: 'TajdeedOutbox',
    entityClass: TajdeedOutbox,
    // The provider-event audit trail. Centre-authored and append-mostly, so no
    // conflict is possible: only the centre that raised an event ever writes
    // its row.
    //
    // Volume note — LANE_STATUS heartbeats add ~288 rows per centre per day and
    // nothing prunes them, so this is the entity most likely to make a run slow
    // over time. A retention policy on the local table is the fix; capping the
    // sync instead would just hide the growth.
    direction: 'WRITE_ONLY',
    conditional: false,
    pushLocal: async (ds, cursor) => pullGlobal(ds, TajdeedOutbox, cursor),
  },
};

/** Fixed pull order — central → centre. Respects dependency chains (Line before Camera/AdminPc mappings, matching the old registry's ordering). */
export const PULL_ORDER = [
  'Centre',
  'Permission',
  'Role',
  'RoleCentreMapping',
  'PaymentType',
  'Test',
  'ChargeCategory',
  'Vehicle',
  'Line',
  'Camera',
  'CameraLineMapping',
  'AdminPc',
  'AdminPcLineMapping',
  'Charge',
  'User',
  'UserLineMapping',
];

/** Fixed push order — centre → central. Bucket C first, then bucket B, matching the original engine's sequence. */
export const PUSH_ORDER = [
  'Line',
  'Charge',
  'User',
  'Camera',
  'CameraLineMapping',
  'AdminPc',
  'AdminPcLineMapping',
  'UserLineMapping',
  'Configuration',
  'Customer',
  'VehicleRecord',
  'AnprCapture',
  'RopVerification',
  'Appointment',
  'Job',
  // After Job — tajdeed_outbox.job_id is an FK, so the jobs must land first.
  'TajdeedOutbox',
  'Payments',
];

/**
 * Mapping (join-table) entities have no independent business meaning for
 * sync direction — they always follow their parent's direction. Kept for
 * documentation/consistency with the old design; the map above already
 * hardcodes each mapping entity's own direction identically to its parent,
 * so no runtime derivation is needed anymore (no config table to derive from).
 */
export const MAPPING_ENTITY_PARENT: Record<string, string> = {
  RoleCentreMapping: 'Role',
  CameraLineMapping: 'Camera',
  AdminPcLineMapping: 'AdminPc',
  UserLineMapping: 'User',
};
