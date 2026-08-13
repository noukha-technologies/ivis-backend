/**
 * Super Admin machine onboarding script — run once on a fresh database that
 * is meant to be the CENTRAL node (see ONBOARDING_DB_SYNC_ARCHITECTURE.md,
 * NODE_ROLE=central). Mirrors onboard.ts's shape exactly, but seeds a
 * GLOBAL Super Admin instead of a centre-scoped System Admin.
 *
 * Steps:
 *   1. Run all pending TypeORM migrations (creates schemas + tables)
 *   2. Seed a full-access permission profile ("Super Admin Access")
 *   3. Seed the "Super Admin" role — access_scope: 'global', linked to zero
 *      centres (Role↔Centre is many-to-many via role_centre_mappings; a
 *      global role never has mapping rows — see role.entity.ts)
 *   4. Create the default Super Admin user (center_id: null)
 *
 * Usage:
 *   npm run onboarding:super-admin
 *
 * Safe to re-run — each step checks for existing records before inserting.
 * Runs against this machine's own local database (AppDataSource /
 * POSTGRES_* env), same as onboard.ts — NOT the CENTRAL_DB_* connection
 * (that one is a read-only link *to* a central DB from a centre node; this
 * script is for bootstrapping the central node itself).
 */

import 'reflect-metadata';
import { loadEnv } from '../common/config/env.config';
import { AppDataSource } from '../modules/database/data-source';
import { Permission } from '../modules/database/entity/permission.entity';
import { Role } from '../modules/database/entity/role.entity';
import { User } from '../modules/database/entity/user.entity';
import { generateSnowflakeId } from '../common/shared/snowflakeIdGeneration';
import {
  APPOINTMENTS_SUBMODULES,
  MASTER_MANAGEMENT_SUBMODULES,
  TRANSACTIONS_SUBMODULES,
  USER_MANAGEMENT_SUBMODULES,
  type RoleAccessMatrix,
  type ModuleCrudFlags,
} from '../common/types/role-access.types';

// Same per-environment resolution the app uses, so a script and the running
// app can never disagree about which database they target.
loadEnv();

// Ensure the schema creation and alteration migrations are allowed to run during onboarding
process.env.RUN_CREATE_SCHEMA = 'true';
process.env.RUN_ALTER_SCHEMA = 'true';

function cliArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match?.slice(prefix.length);
}

const SUPER_ADMIN_EMAIL = (
  cliArg('email') ||
  process.env.SEED_SUPER_ADMIN_EMAIL ||
  'ranjeeth@opalgcc.com'
)
  .trim()
  .toLowerCase();
const SUPER_ADMIN_PASSWORD =
  cliArg('password') || process.env.SEED_SUPER_ADMIN_PASSWORD || 'Admin@123';
const SUPER_ADMIN_USER_CODE = 'SUPERADMIN';
const SUPER_ADMIN_USER_NAME = 'Super Admin';
const SUPER_ADMIN_ROLE_NAME = 'Super Admin';
const SUPER_ADMIN_PERM_NAME = 'Super Admin Access';

function all(): ModuleCrudFlags {
  return { create: true, edit: true, view: true };
}

function allSubmap<T extends string>(keys: T[]): Record<T, ModuleCrudFlags> {
  return Object.fromEntries(keys.map((k) => [k, all()])) as Record<
    T,
    ModuleCrudFlags
  >;
}

function buildFullAccessMatrix(): RoleAccessMatrix {
  return {
    dashboard: all(),
    job_management: all(),
    reports_analytics: all(),
    configuration: all(),
    appointments: { ...all(), submodules: allSubmap(APPOINTMENTS_SUBMODULES) },
    master_management: {
      ...all(),
      submodules: allSubmap(MASTER_MANAGEMENT_SUBMODULES),
    },
    transactions: { ...all(), submodules: allSubmap(TRANSACTIONS_SUBMODULES) },
    user_management: {
      ...all(),
      submodules: allSubmap(USER_MANAGEMENT_SUBMODULES),
    },
  };
}

function log(msg: string): void {
  process.stdout.write(`[onboard-super-admin] ${msg}\n`);
}

async function main(): Promise<void> {
  log('Connecting to database...');
  const ds = await AppDataSource.initialize();
  log('Connected.');

  try {
    /* ── Step 1: Migrations ─────────────────────────────────────────── */
    log('Running pending migrations...');
    const ran = await ds.runMigrations({ transaction: 'each' });
    if (ran.length > 0) {
      log(`Ran ${ran.length} migration(s):`);
      for (const m of ran) log(`  + ${m.name}`);
    } else {
      log('No pending migrations — all up to date.');
    }

    const permRepo = ds.getRepository(Permission);
    const roleRepo = ds.getRepository(Role);
    const userRepo = ds.getRepository(User);

    /* ── Step 2: Permission profile ─────────────────────────────────── */
    log(`Seeding permission profile "${SUPER_ADMIN_PERM_NAME}"...`);
    let perm = await permRepo.findOne({
      where: { name: SUPER_ADMIN_PERM_NAME, is_deleted: false },
    });
    if (perm) {
      log('  Already exists — refreshing access matrix.');
      perm.access = buildFullAccessMatrix();
      perm = await permRepo.save(perm);
    } else {
      perm = permRepo.create({
        id: generateSnowflakeId(),
        name: SUPER_ADMIN_PERM_NAME,
        access: buildFullAccessMatrix(),
        is_active: true,
      });
      perm = await permRepo.save(perm);
      log(`  Created (id: ${perm.id})`);
    }

    /* ── Step 3: Role (global scope — linked to zero centres) ──────── */
    log(`Seeding role "${SUPER_ADMIN_ROLE_NAME}"...`);
    let role = await roleRepo.findOne({
      where: { role_name: SUPER_ADMIN_ROLE_NAME, is_deleted: false },
    });
    if (role) {
      log('  Already exists — skipping.');
    } else {
      // Role↔Centre is many-to-many (role_centre_mappings) — a global role
      // is simply never linked to any centre, no mapping rows to create.
      role = roleRepo.create({
        id: generateSnowflakeId(),
        role_name: SUPER_ADMIN_ROLE_NAME,
        permission_id: perm.id,
        description: 'Global Super Admin role (all centres)',
        access_scope: 'global',
        is_center_admin: false,
      });
      role = await roleRepo.save(role);
      log(`  Created (id: ${role.id})`);
    }

    /* ── Step 4: Super Admin user (center_id: null) ─────────────────── */
    log(`Seeding Super Admin user "${SUPER_ADMIN_EMAIL}"...`);
    // Matched on user_code, not email: the code is the stable identity for
    // this account, so changing the configured email updates the existing
    // Super Admin rather than seeding a second one alongside it.
    const existing = await userRepo.findOne({
      where: { user_code: SUPER_ADMIN_USER_CODE, is_deleted: false },
    });
    if (existing) {
      if (existing.email !== SUPER_ADMIN_EMAIL) {
        const previous = existing.email;
        existing.email = SUPER_ADMIN_EMAIL;
        await userRepo.save(existing);
        log(`  Updated email: ${previous} → ${SUPER_ADMIN_EMAIL}`);
      } else {
        log(`  Already exists (user_id: ${existing.user_id}) — skipping.`);
      }
      // The password is deliberately NOT reset here: re-running this script on
      // a live machine must never silently restore a default credential.
    } else {
      const { max } = (await userRepo
        .createQueryBuilder('u')
        .select('MAX(u.user_id)', 'max')
        .getRawOne<{ max: number | null }>()) ?? { max: null };

      const nextUserId = (max ?? 0) + 1;

      const user = userRepo.create({
        id: generateSnowflakeId(),
        user_id: nextUserId,
        user_code: SUPER_ADMIN_USER_CODE,
        user_name: SUPER_ADMIN_USER_NAME,
        email: SUPER_ADMIN_EMAIL,
        password: SUPER_ADMIN_PASSWORD, // hashed by User @BeforeInsert hook
        role_id: role.id,
        center_id: null,
        created_by: 'onboard-super-admin-script',
      });
      const saved = await userRepo.save(user);
      log(`  Created (id: ${saved.id}, user_id: ${saved.user_id})`);
    }

    /* ── Summary ────────────────────────────────────────────────────── */
    log('');
    log('Super Admin machine onboarding complete.');
    log(`  Email:      ${SUPER_ADMIN_EMAIL}`);
    log(`  Password:   ${SUPER_ADMIN_PASSWORD}`);
    log(`  Role:       ${SUPER_ADMIN_ROLE_NAME} (access_scope: global)`);
    log(`  Permission: ${SUPER_ADMIN_PERM_NAME}`);
    log('');
    log('Set NODE_ROLE=central in this machine\'s .env — this DB is now the central node.');
    log('Change the default password after first login.');
  } finally {
    await ds.destroy();
    log('Connection closed.');
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`[onboard-super-admin] Fatal: ${String(err)}\n`);
  process.exit(1);
});
