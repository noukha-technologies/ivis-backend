import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migrates core.permissions.access from the old 9-flat-module shape to the
 * new 8-module shape with nested submodule flags.
 *
 * Old modules: job_management, vehicle_customer, appointments, payments,
 *              vehicle_records, file_processing, rop_integration, user_roles,
 *              reports_analytics
 *
 * New modules: dashboard, appointments (+ submodules), job_management,
 *              reports_analytics, configuration, master_management (+ submodules),
 *              transactions (+ submodules), user_management (+ submodules)
 *
 * Mapping (conservative — existing access is never narrowed):
 *   reports_analytics.view → dashboard.view, reports_analytics.view, configuration.view
 *   user_roles.*           → master_management.* + all 5 non-ANPR submodules inherit same flags
 *                            user_management.*   + all 3 user/roles/permissions submodules
 *   vehicle_customer.*     → transactions.submodules.customers.*
 *                            master_management.submodules.camera_anpr.*
 *   payments.*             → transactions.submodules.payments.*
 *   vehicle_records.*      → transactions.submodules.vehicle_records.*
 *   file_processing.*      → transactions.submodules.file_processing.*
 *   rop_integration.*      → transactions.submodules.rop_management.*
 *   appointments.*         → appointments.* + list_view/calendar_view submodules inherit same flags
 *
 * Guard: WHERE access ? 'user_roles' ensures only old-format rows are migrated.
 */
export class MigratePermissionsToSubmodule1783000000000 implements MigrationInterface {
  name = 'MigratePermissionsToSubmodule1783000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE core.permissions
      SET access = jsonb_build_object(
        -- ── Flat modules ─────────────────────────────────────────────────────
        'dashboard', jsonb_build_object(
          'view',   COALESCE((access -> 'reports_analytics' ->> 'view')::boolean, false),
          'create', false,
          'edit',   false
        ),
        'job_management', access -> 'job_management',
        'reports_analytics', jsonb_build_object(
          'view',   COALESCE((access -> 'reports_analytics' ->> 'view')::boolean, false),
          'create', false,
          'edit',   false
        ),
        'configuration', jsonb_build_object(
          'view',   COALESCE((access -> 'reports_analytics' ->> 'view')::boolean, false),
          'create', false,
          'edit',   false
        ),

        -- ── appointments (adds list_view / calendar_view submodules) ─────────
        'appointments', jsonb_build_object(
          'view',   COALESCE((access -> 'appointments' ->> 'view')::boolean, false),
          'create', COALESCE((access -> 'appointments' ->> 'create')::boolean, false),
          'edit',   COALESCE((access -> 'appointments' ->> 'edit')::boolean, false),
          'submodules', jsonb_build_object(
            'list_view',     access -> 'appointments',
            'calendar_view', access -> 'appointments'
          )
        ),

        -- ── master_management (from user_roles + camera_anpr from vehicle_customer) ──
        'master_management', jsonb_build_object(
          'view',   COALESCE((access -> 'user_roles' ->> 'view')::boolean, false),
          'create', COALESCE((access -> 'user_roles' ->> 'create')::boolean, false),
          'edit',   COALESCE((access -> 'user_roles' ->> 'edit')::boolean, false),
          'submodules', jsonb_build_object(
            'vehicle',     access -> 'user_roles',
            'center',      access -> 'user_roles',
            'line',        access -> 'user_roles',
            'admin_pc',    access -> 'user_roles',
            'charges',     access -> 'user_roles',
            'camera_anpr', jsonb_build_object(
              'view',   COALESCE((access -> 'vehicle_customer' ->> 'view')::boolean, false),
              'create', COALESCE((access -> 'vehicle_customer' ->> 'create')::boolean, false),
              'edit',   COALESCE((access -> 'vehicle_customer' ->> 'edit')::boolean, false)
            )
          )
        ),

        -- ── transactions (payments, vehicle_records, file_processing, rop, customers) ──
        'transactions', jsonb_build_object(
          'view', (
            COALESCE((access -> 'payments' ->> 'view')::boolean, false) OR
            COALESCE((access -> 'vehicle_records' ->> 'view')::boolean, false) OR
            COALESCE((access -> 'file_processing' ->> 'view')::boolean, false) OR
            COALESCE((access -> 'rop_integration' ->> 'view')::boolean, false) OR
            COALESCE((access -> 'vehicle_customer' ->> 'view')::boolean, false)
          ),
          'create', (
            COALESCE((access -> 'payments' ->> 'create')::boolean, false) OR
            COALESCE((access -> 'vehicle_records' ->> 'create')::boolean, false) OR
            COALESCE((access -> 'rop_integration' ->> 'create')::boolean, false) OR
            COALESCE((access -> 'vehicle_customer' ->> 'create')::boolean, false)
          ),
          'edit', (
            COALESCE((access -> 'payments' ->> 'edit')::boolean, false) OR
            COALESCE((access -> 'vehicle_records' ->> 'edit')::boolean, false) OR
            COALESCE((access -> 'rop_integration' ->> 'edit')::boolean, false) OR
            COALESCE((access -> 'vehicle_customer' ->> 'edit')::boolean, false)
          ),
          'submodules', jsonb_build_object(
            'payments',        access -> 'payments',
            'vehicle_records', access -> 'vehicle_records',
            'file_processing', access -> 'file_processing',
            'rop_management',  access -> 'rop_integration',
            'customers', jsonb_build_object(
              'view',   COALESCE((access -> 'vehicle_customer' ->> 'view')::boolean, false),
              'create', COALESCE((access -> 'vehicle_customer' ->> 'create')::boolean, false),
              'edit',   COALESCE((access -> 'vehicle_customer' ->> 'edit')::boolean, false)
            )
          )
        ),

        -- ── user_management (from user_roles, split into users/roles/permissions) ──
        'user_management', jsonb_build_object(
          'view',   COALESCE((access -> 'user_roles' ->> 'view')::boolean, false),
          'create', COALESCE((access -> 'user_roles' ->> 'create')::boolean, false),
          'edit',   COALESCE((access -> 'user_roles' ->> 'edit')::boolean, false),
          'submodules', jsonb_build_object(
            'users',       access -> 'user_roles',
            'roles',       access -> 'user_roles',
            'permissions', access -> 'user_roles'
          )
        )
      )
      WHERE access ? 'user_roles'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE core.permissions
      SET access = jsonb_build_object(
        'job_management',   access -> 'job_management',
        'appointments',     jsonb_build_object(
          'view',   COALESCE((access -> 'appointments' ->> 'view')::boolean, false),
          'create', COALESCE((access -> 'appointments' ->> 'create')::boolean, false),
          'edit',   COALESCE((access -> 'appointments' ->> 'edit')::boolean, false)
        ),
        'payments',         access -> 'transactions' -> 'submodules' -> 'payments',
        'vehicle_records',  access -> 'transactions' -> 'submodules' -> 'vehicle_records',
        'file_processing',  access -> 'transactions' -> 'submodules' -> 'file_processing',
        'rop_integration',  access -> 'transactions' -> 'submodules' -> 'rop_management',
        'vehicle_customer', jsonb_build_object(
          'view',   (
            COALESCE((access -> 'transactions' -> 'submodules' -> 'customers' ->> 'view')::boolean, false) OR
            COALESCE((access -> 'master_management' -> 'submodules' -> 'camera_anpr' ->> 'view')::boolean, false)
          ),
          'create', (
            COALESCE((access -> 'transactions' -> 'submodules' -> 'customers' ->> 'create')::boolean, false) OR
            COALESCE((access -> 'master_management' -> 'submodules' -> 'camera_anpr' ->> 'create')::boolean, false)
          ),
          'edit', (
            COALESCE((access -> 'transactions' -> 'submodules' -> 'customers' ->> 'edit')::boolean, false) OR
            COALESCE((access -> 'master_management' -> 'submodules' -> 'camera_anpr' ->> 'edit')::boolean, false)
          )
        ),
        'user_roles', access -> 'user_management',
        'reports_analytics', jsonb_build_object(
          'view', (
            COALESCE((access -> 'dashboard' ->> 'view')::boolean, false) OR
            COALESCE((access -> 'reports_analytics' ->> 'view')::boolean, false) OR
            COALESCE((access -> 'configuration' ->> 'view')::boolean, false)
          ),
          'create', false,
          'edit',   false
        )
      )
      WHERE access ? 'user_management'
    `);
  }
}
