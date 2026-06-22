/**
 * Onboarding script — run once on a fresh database.
 *
 * Steps:
 *   1. Run all pending TypeORM migrations (creates schemas + tables)
 *   2. Seed a full-access permission profile ("System Admin Access")
 *   3. Seed the "System Admin" role linked to that profile
 *   4. Create the default system admin user (admin@opalivis.in / Admin@123)
 *
 * Usage:
 *   npm run onboarding
 *
 * Safe to re-run — each step checks for existing records before inserting.
 */

import 'reflect-metadata';
import * as dotenv from 'dotenv';
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

dotenv.config();

const ADMIN_EMAIL       = 'admin@opalivis.in';
const ADMIN_PASSWORD    = 'Admin@123';
const ADMIN_USER_CODE   = 'SYSADMIN';
const ADMIN_USER_NAME   = 'System Admin';
const ADMIN_ROLE_NAME   = 'System Admin';
const ADMIN_PERM_NAME   = 'System Admin Access';

function all(): ModuleCrudFlags {
  return { create: true, edit: true, view: true };
}

function allSubmap<T extends string>(keys: T[]): Record<T, ModuleCrudFlags> {
  return Object.fromEntries(keys.map(k => [k, all()])) as Record<T, ModuleCrudFlags>;
}

function buildFullAccessMatrix(): RoleAccessMatrix {
  return {
    dashboard:         all(),
    job_management:    all(),
    reports_analytics: all(),
    configuration:     all(),
    appointments:      { ...all(), submodules: allSubmap(APPOINTMENTS_SUBMODULES) },
    master_management: { ...all(), submodules: allSubmap(MASTER_MANAGEMENT_SUBMODULES) },
    transactions:      { ...all(), submodules: allSubmap(TRANSACTIONS_SUBMODULES) },
    user_management:   { ...all(), submodules: allSubmap(USER_MANAGEMENT_SUBMODULES) },
  };
}

function log(msg: string): void {
  process.stdout.write(`[onboard] ${msg}\n`);
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
    log(`Seeding permission profile "${ADMIN_PERM_NAME}"...`);
    let perm = await permRepo.findOne({ where: { name: ADMIN_PERM_NAME, is_deleted: false } });
    if (perm) {
      log('  Already exists — refreshing access matrix.');
      perm.access = buildFullAccessMatrix();
      perm = await permRepo.save(perm);
    } else {
      perm = permRepo.create({
        id:        generateSnowflakeId(),
        name:      ADMIN_PERM_NAME,
        access:    buildFullAccessMatrix(),
        is_active: true,
      });
      perm = await permRepo.save(perm);
      log(`  Created (id: ${perm.id})`);
    }

    /* ── Step 3: Role ───────────────────────────────────────────────── */
    log(`Seeding role "${ADMIN_ROLE_NAME}"...`);
    let role = await roleRepo.findOne({ where: { role_name: ADMIN_ROLE_NAME, is_deleted: false } });
    if (role) {
      log('  Already exists — skipping.');
    } else {
      role = roleRepo.create({
        id:            generateSnowflakeId(),
        role_name:     ADMIN_ROLE_NAME,
        permission_id: perm.id,
        description:   'Full-access system administrator role',
      });
      role = await roleRepo.save(role);
      log(`  Created (id: ${role.id})`);
    }

    /* ── Step 4: Admin user ─────────────────────────────────────────── */
    log(`Seeding admin user "${ADMIN_EMAIL}"...`);
    const existing = await userRepo.findOne({ where: { email: ADMIN_EMAIL, is_deleted: false } });
    if (existing) {
      log(`  Already exists (user_id: ${existing.user_id}) — skipping.`);
    } else {
      const { max } = await userRepo
        .createQueryBuilder('u')
        .select('MAX(u.user_id)', 'max')
        .getRawOne<{ max: number | null }>() ?? { max: null };

      const nextUserId = (max ?? 0) + 1;

      const user = userRepo.create({
        id:         generateSnowflakeId(),
        user_id:    nextUserId,
        user_code:  ADMIN_USER_CODE,
        user_name:  ADMIN_USER_NAME,
        email:      ADMIN_EMAIL,
        password:   ADMIN_PASSWORD,   // hashed by User @BeforeInsert hook
        role_id:    role.id,
        created_by: 'onboard-script',
      });
      const saved = await userRepo.save(user);
      log(`  Created (id: ${saved.id}, user_id: ${saved.user_id})`);
    }

    /* ── Summary ────────────────────────────────────────────────────── */
    log('');
    log('Onboarding complete.');
    log(`  Email:      ${ADMIN_EMAIL}`);
    log(`  Password:   ${ADMIN_PASSWORD}`);
    log(`  Role:       ${ADMIN_ROLE_NAME}`);
    log(`  Permission: ${ADMIN_PERM_NAME}`);
    log('');
    log('Change the default password after first login.');

  } finally {
    await ds.destroy();
    log('Connection closed.');
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`[onboard] Fatal: ${String(err)}\n`);
  process.exit(1);
});
