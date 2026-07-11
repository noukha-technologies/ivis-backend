/**
 * Seeds a Super Admin (global access_scope) directly into the CENTRAL
 * (Master) database — so there's a real central identity for Onboarding
 * Sync's re-scoping to copy down onto centre servers.
 * See ONBOARDING_DB_SYNC_ARCHITECTURE.md and SUPER_ADMIN_ONBOARDING_FIX_PLAN.md.
 *
 * IMPORTANT: this needs a WRITABLE Postgres role against the central
 * database. Unrelated to the app's own CENTRAL_SYNC_API_URL/KEY (HTTPS-only
 * sync, see Database_sync_arch_replan.md) — this script builds its own
 * direct DataSource from CENTRAL_DB_*-shaped env vars, since it runs once,
 * by hand, directly against the central box's own local Postgres.
 *
 * Does NOT run migrations — the central database is expected to already
 * have the schema (it's a normal ivis-backend database in its own right).
 *
 * Usage:
 *   npm run seed:central-super-admin -- --email=admin@opalivis.in --password=Admin@123
 *   (or set SEED_SUPER_ADMIN_EMAIL / SEED_SUPER_ADMIN_PASSWORD env vars)
 *
 * Safe to re-run — idempotent find-or-create by role_name/email.
 */

import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
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

dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function cliArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match?.slice(prefix.length);
}

const SUPER_ADMIN_EMAIL = (
  cliArg('email') ||
  process.env.SEED_SUPER_ADMIN_EMAIL ||
  'superadmin@opalivis.in'
)
  .trim()
  .toLowerCase();
const SUPER_ADMIN_PASSWORD =
  cliArg('password') || process.env.SEED_SUPER_ADMIN_PASSWORD || 'SuperAdmin@123';
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
  process.stdout.write(`[seed-central-super-admin] ${msg}\n`);
}

async function main(): Promise<void> {
  const sslMode = process.env.CENTRAL_DB_SSLMODE?.trim() || 'disable';
  const ds = new DataSource({
    type: 'postgres',
    host: requireEnv('CENTRAL_DB_HOST'),
    port: Number.parseInt(requireEnv('CENTRAL_DB_PORT'), 10),
    username: requireEnv('CENTRAL_DB_USER'),
    password: requireEnv('CENTRAL_DB_PASSWORD'),
    database: requireEnv('CENTRAL_DB_DB'),
    ssl: sslMode === 'require' ? { rejectUnauthorized: false } : false,
    synchronize: false,
    entities: [Permission, Role, User],
  });

  log('Connecting to CENTRAL database...');
  await ds.initialize();
  log('Connected.');

  try {
    const permRepo = ds.getRepository(Permission);
    const roleRepo = ds.getRepository(Role);
    const userRepo = ds.getRepository(User);

    /* ── Permission profile ─────────────────────────────────────────── */
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

    /* ── Role (global scope, no owning centre) ─────────────────────── */
    log(`Seeding role "${SUPER_ADMIN_ROLE_NAME}"...`);
    let role = await roleRepo.findOne({
      where: {
        role_name: SUPER_ADMIN_ROLE_NAME,
        is_deleted: false,
      },
    });
    if (role) {
      log('  Already exists — skipping.');
    } else {
      // Global roles have no centre link at all (Role↔Centre is many-to-many
      // via role_centre_mappings; a global role has zero mapping rows).
      role = roleRepo.create({
        id: generateSnowflakeId(),
        role_name: SUPER_ADMIN_ROLE_NAME,
        permission_id: perm.id,
        description: 'Global Super Admin role (all centres)',
        access_scope: 'global',
      });
      role = await roleRepo.save(role);
      log(`  Created (id: ${role.id})`);
    }

    /* ── Super Admin user (center_id: null) ─────────────────────────── */
    log(`Seeding Super Admin user "${SUPER_ADMIN_EMAIL}"...`);
    const existing = await userRepo.findOne({
      where: { email: SUPER_ADMIN_EMAIL, is_deleted: false },
    });
    if (existing) {
      log(`  Already exists (user_id: ${existing.user_id}) — skipping.`);
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
        password: SUPER_ADMIN_PASSWORD, // hashed by the User entity @BeforeInsert hook
        role_id: role.id,
        center_id: null,
        created_by: 'seed-central-super-admin-script',
      });
      const saved = await userRepo.save(user);
      log(`  Created (id: ${saved.id}, user_id: ${saved.user_id})`);
    }

    log('');
    log('Central Super Admin seed complete.');
    log(`  Email:    ${SUPER_ADMIN_EMAIL}`);
    log(`  Password: ${SUPER_ADMIN_PASSWORD}`);
    log(`  Role:     ${SUPER_ADMIN_ROLE_NAME} (access_scope: global)`);
    log('');
    log('Change the default password after first login.');
  } finally {
    await ds.destroy();
    log('Connection closed.');
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`[seed-central-super-admin] Fatal: ${String(err)}\n`);
  process.exit(1);
});
