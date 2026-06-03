/**
 * End-to-end API smoke test for the IVIS backend.
 *
 * What it does:
 *   1. Bootstraps an admin user directly in Postgres (the API has no public
 *      "create first user" route, so we seed one linked to the migration-seeded
 *      `admin` role_access).
 *   2. Logs in over HTTP to obtain a JWT.
 *   3. Walks every controller (auth, users, permissions, masters, transactions,
 *      appointments, jobs) in FK-dependency order, chaining real IDs from each
 *      create into dependent requests.
 *   4. Prints a PASS/FAIL table and exits non-zero if anything unexpected fails.
 *
 * Prereqorequisites: DB up + migrations run + server running. The companion
 * `scripts/run-api-tests.sh` wires all of that together.
 *
 * Usage:  node scripts/test-apis.mjs
 */
import dotenv from 'dotenv';
import pg from 'pg';
import Snowflakify from 'snowflakify';

dotenv.config();

const snowflakify = new Snowflakify({ epoch: 1288834974657 });
const newId = () => snowflakify.nextId().toString();

const PORT = process.env.PORT || '4780';
const PREFIX = process.env.API_PREFIX || 'api/ivis-backend-service/v1';
const BASE = (process.env.API_BASE_URL || `http://localhost:${PORT}/${PREFIX}`).replace(/\/$/, '');

const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || 'admin@ivis.local';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || 'Admin@12345';

const S = Date.now().toString().slice(-7); // unique suffix per run

// Keep mode: don't delete the records created during the run, so they persist
// in the DB for inspection. Enable with KEEP_DATA=1 or the --keep flag.
const KEEP = process.env.KEEP_DATA === '1' || process.env.KEEP_DATA === 'true' || process.argv.includes('--keep');

// ---------------------------------------------------------------------------
// 1. Bootstrap an admin user in the DB
// ---------------------------------------------------------------------------
async function seedVehicleRecord() {
  const client = new pg.Client({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres',
    database: process.env.POSTGRES_DB || 'ivis_backend',
  });
  await client.connect();
  try {
    // Seed a reusable vehicle_record — jobs & payment-transactions reference one,
    // and there is no public route to create it.
    const vrId = newId();
    const vr = await client.query(
      `INSERT INTO transaction.vehicle_records
         (id, vehicle_record_id, plate_number, chassis_no, vehicle_make, vehicle_model, is_deleted)
       VALUES ($1, $2, $3, $4, $5, $6, false)
       ON CONFLICT (plate_number) DO UPDATE SET is_deleted = false
       RETURNING id`,
      [vrId, 990001, 'QARC0001', 'CH-QARC0001', 'Toyota', 'Corolla'],
    );
    return vr.rows[0].id;
  } finally {
    await client.end();
  }
}

// ---------------------------------------------------------------------------
// 2. HTTP helper + result tracking
// ---------------------------------------------------------------------------
const ctx = {};
let token = '';
const results = [];

async function call(name, method, path, { body, expect = [200, 201], allowFail = false, save, auth = true } = {}) {
  const url = `${BASE}${path}`;
  const headers = { 'Content-Type': 'application/json' };
  if (auth && token) headers.Authorization = `Bearer ${token}`;
  let status = 0;
  let json = null;
  let text = '';
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    status = res.status;
    text = await res.text();
    try { json = text ? JSON.parse(text) : null; } catch { /* non-json */ }
  } catch (err) {
    text = String(err.message || err);
  }

  const ok = expect.includes(status);
  if (ok && save && json) save(json);
  results.push({ name, method, path, status, ok, allowFail, detail: ok ? '' : trimDetail(text) });

  const tag = ok ? 'PASS' : allowFail ? 'WARN' : 'FAIL';
  console.log(`  [${tag}] ${method.padEnd(6)} ${path}  -> ${status || 'ERR'}`);
  return { status, json, ok };
}

function trimDetail(text) {
  if (!text) return '';
  return text.replace(/\s+/g, ' ').slice(0, 180);
}

// extract a created entity id from the wrapped response { data: {...} }
const idOf = (json) => json?.data?.id ?? json?.data?.role_access_id ?? null;

// ---------------------------------------------------------------------------
// 3. The endpoint walk (dependency-ordered)
// ---------------------------------------------------------------------------
async function run() {
  console.log(`\nBASE: ${BASE}\n`);

  console.log('App / Auth');
  await call('Health', 'GET', '/', { auth: false });

  // Bootstrap the first admin (no-op 403 if the system already has users).
  await call('Bootstrap admin', 'POST', '/auth/bootstrap', {
    auth: false,
    expect: [201, 403],
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, user_name: 'QA Admin', user_code: 'ADMINQA' },
  });

  const login = await call('Login', 'POST', '/auth/login', {
    auth: false,
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    save: (j) => {
      const d = j.data || j;
      token = d.accessToken;
      ctx.refreshToken = d.refreshToken;
    },
  });
  if (!token) {
    console.error('\nLogin failed — cannot test protected endpoints. Detail:', login.json || '');
    summarize();
    process.exit(1);
  }
  await call('Refresh token', 'POST', '/auth/refresh', {
    auth: false,
    body: { refreshToken: ctx.refreshToken },
    save: (j) => { const d = j.data || j; if (d.accessToken) token = d.accessToken; },
  });

  // Permission profiles (access matrices) -----------------------------------
  console.log('\nPermissions (access profiles)');
  await call('List permission keys', 'GET', '/permissions/keys');
  await call('Create permission profile', 'POST', '/permissions', {
    body: { name: `QA Profile ${S}`, access: ACCESS_MATRIX, is_active: true },
    save: (j) => { ctx.permissionId = idOf(j); },
  });
  await call('List permission profiles', 'GET', '/permissions?page=1&limit=10');
  if (ctx.permissionId) {
    await call('Get permission profile', 'GET', `/permissions/${ctx.permissionId}`);
    await call('Update permission profile', 'PATCH', `/permissions/${ctx.permissionId}`, {
      body: { access: ACCESS_MATRIX, is_active: true },
    });
  }

  // Roles (role_name -> permission profile) ---------------------------------
  console.log('\nRoles');
  ctx.roleName = `QA Role ${S}`;
  await call('Create role', 'POST', '/roles', {
    body: { role_name: ctx.roleName, permission_id: ctx.permissionId, description: 'QA role' },
    save: (j) => { ctx.roleId = idOf(j); },
  });
  await call('List roles', 'GET', '/roles?page=1&limit=10');
  await call('Get role by name', 'GET', `/roles/by-name/${encodeURIComponent(ctx.roleName)}`);
  if (ctx.roleId) {
    await call('Get role by id', 'GET', `/roles/${ctx.roleId}`);
    await call('Update role', 'PATCH', `/roles/${ctx.roleId}`, { body: { description: 'QA role updated' } });
  }

  // Masters -----------------------------------------------------------------
  console.log('\nMasters');
  await crud('Centre', 'centreId', '/masters/centres',
    { name: `Centre ${S}`, code: `C${S}`, description: 'QA', status: 'Active' },
    { name: `Centre ${S} upd`, status: 'Active' });

  await crud('Line', 'lineId', '/masters/lines',
    () => ({ name: `Line ${S}`, code: `L${S}`, centre_id: ctx.centreId, display_order: 1, description: 'QA', status: 'Active' }),
    { name: `Line ${S} upd`, display_order: 2 });

  await crud('Admin PC', 'adminPcId', '/masters/admin-pcs',
    () => ({ name: `PC ${S}`, code: `PC${S}`, ip_address: '192.168.10.15', centre_id: ctx.centreId, description: 'QA', status: 'Active' }),
    { ip_address: '192.168.10.16', status: 'Active' });

  await crud('Camera', 'cameraId', '/masters/cameras',
    () => ({ name: `CAM ${S}`, code: `CAM${S}`, type: 'ANPR', line_id: ctx.lineId, description: 'QA', status: 'Active' }),
    { name: `CAM ${S} upd`, status: 'Active' });

  await crud('Payment mode', 'paymentId', '/masters/payments',
    { name: `Cash ${S}`, code: `PM${S}`, status: 'Active' },
    { name: `Cash ${S} upd`, status: 'Active' });

  await crud('Test', 'testId', '/masters/tests',
    { name: `Brake ${S}`, code: `VT${S}`, status: 'Active' },
    { name: `Brake ${S} upd`, status: 'Active' });

  await crud('Vehicle master', 'vehicleId', '/masters/vehicles',
    { name: `Sedan ${S}`, code: `VS${S}`, vin_no: `VIN${S}AAA0001`, status: 'Active' },
    { name: `Sedan ${S} upd`, status: 'Active' });

  // Users -------------------------------------------------------------------
  console.log('\nUsers');
  await crud('User', 'userId', '/users',
    () => ({
      user_code: `U${S}`,
      user_name: 'QA User',
      email: `qa_${S}@ivis.local`,
      role_id: ctx.roleId,
      center_id: ctx.centreId,
      line_ids: ctx.lineId ? [ctx.lineId] : [],
      password: 'P@ssw0rd123',
    }),
    { user_name: 'QA User Updated' });

  // Transactions ------------------------------------------------------------
  console.log('\nTransactions');
  await crud('ANPR capture', 'anprId', '/transactions/anpr-captures',
    () => ({
      plate_number: `OM-${S}`, normalized_plate: `OM${S}`, plate_confidence: 98.4,
      capture_time: new Date().toISOString(), camera_id: ctx.cameraId, lane: 'Line 1',
      direction: 'forward', country_code: 'OM', plate_color: 'white', vehicle_type: 'car',
      vehicle_color: 'silver', verification_status: 'Pending', simulate_rop: false,
    }),
    { verification_status: 'Verified' });

  await crud('ROP verification', 'ropId', '/transactions/rop-verifications',
    () => ({
      anpr_capture_id: ctx.anprId, owner_name: 'Ahmed', vehicle_make: 'Toyota',
      vehicle_model: 'Corolla', reg_no: `OM-${S}`, chassis_no: `CH${S}`,
      insurance: 'Valid', reg_expiry: '2026-12-31', fetch_status: 'Not Fetched',
    }),
    { fetch_status: 'Fetched' });

  await crud('Customer', 'customerId', '/transactions/customers',
    { name: `Ahmed ${S}`, phone: `+96891${S}`, owner_name: `Ahmed ${S}`, id_number: `ID${S}`, plate_number: `OM-${S}`, plate_color: 'Green' },
    { phone: `+96892${S}` });

  await crud('Appointment', 'apptId', '/appointments',
    { customer_name: `Ahmed ${S}`, customer_phone: `+96891${S}`, id_number: `ID${S}`, plate_number: `OM-${S}`, appointment_at: new Date(Date.now() + 86400000).toISOString(), status: 'Scheduled', sync_customer: false, notes: 'QA' },
    { status: 'Completed', notes: 'done' });

  // These need a vehicle_record_id (no public create route) — attempt, tolerate failure.
  await crud('Payment transaction', 'payTxnId', '/transactions/payment-transactions',
    () => ({ customer_id: ctx.customerId, vehicle_record_id: ctx.vehicleRecordId, payment_type: 'Mix', status: 'Pending', charges: 30, vat: 1.5, grand_total: 31.5, pay_date: new Date().toISOString(), auto_create_job: false }),
    { status: 'Paid' }, { allowFail: true });

  await crud('Job', 'jobId', '/jobs',
    () => ({ source: 'Booked', status: 'Pending', customer_id: ctx.customerId, vehicle_record_id: ctx.vehicleRecordId }),
    { status: 'Passed', overall_result: 'Passed' },
    { allowFail: true });

  if (KEEP) {
    // Keep mode: leave everything we created in the DB.
    console.log('\nKeep mode (--keep / KEEP_DATA=1): created records retained — skipping cleanup');
    printCreated();
  } else {
    // Cleanup (also exercises DELETE) — reverse dependency order -------------
    console.log('\nCleanup (DELETE)');
    await del('Job', '/jobs', ctx.jobId, true);
    await del('Payment transaction', '/transactions/payment-transactions', ctx.payTxnId, true);
    await del('Appointment', '/appointments', ctx.apptId);
    await del('Customer', '/transactions/customers', ctx.customerId);
    await del('ROP verification', '/transactions/rop-verifications', ctx.ropId);
    await del('ANPR capture', '/transactions/anpr-captures', ctx.anprId);
    await del('User', '/users', ctx.userId);
    await del('Vehicle master', '/masters/vehicles', ctx.vehicleId);
    await del('Test', '/masters/tests', ctx.testId);
    await del('Payment mode', '/masters/payments', ctx.paymentId);
    await del('Camera', '/masters/cameras', ctx.cameraId);
    await del('Admin PC', '/masters/admin-pcs', ctx.adminPcId);
    await del('Line', '/masters/lines', ctx.lineId);
    await del('Centre', '/masters/centres', ctx.centreId);
    await del('Role', '/roles', ctx.roleId);
    await del('Permission profile', '/permissions', ctx.permissionId);
  }

  await call('Logout', 'POST', '/auth/logout');

  summarize();
}

function printCreated() {
  const labels = {
    permissionId: 'Permission profile', roleId: 'Role', centreId: 'Centre', lineId: 'Line',
    adminPcId: 'Admin PC', cameraId: 'Camera', paymentId: 'Payment mode', testId: 'Test',
    vehicleId: 'Vehicle master', userId: 'User', anprId: 'ANPR capture', ropId: 'ROP verification',
    customerId: 'Customer', apptId: 'Appointment', payTxnId: 'Payment transaction', jobId: 'Job',
  };
  console.log('Created records (left in DB):');
  for (const [key, label] of Object.entries(labels)) {
    if (ctx[key]) console.log(`  ${label.padEnd(20)} ${ctx[key]}`);
  }
}

// Create -> List -> Get -> Update for one resource. `bodyOrFn` may be a fn so it
// can read ctx ids captured by earlier steps. Stores created id in ctx[key].
async function crud(label, key, base, bodyOrFn, patchBody, opts = {}) {
  const body = typeof bodyOrFn === 'function' ? bodyOrFn() : bodyOrFn;
  const created = await call(`Create ${label}`, 'POST', base, {
    body, allowFail: opts.allowFail, save: (j) => { ctx[key] = idOf(j); },
  });
  await call(`List ${label}`, 'GET', `${base}?page=1&limit=10`, { allowFail: opts.allowFail });
  if (ctx[key]) {
    await call(`Get ${label}`, 'GET', `${base}/${ctx[key]}`, { allowFail: opts.allowFail });
    await call(`Update ${label}`, 'PATCH', `${base}/${ctx[key]}`, { body: patchBody, allowFail: opts.allowFail });
  } else if (!created.ok) {
    console.log(`    (skipped Get/Update ${label} — create did not return an id)`);
  }
}

async function del(label, base, id, allowFail = false) {
  if (!id) { console.log(`    (skipped Delete ${label} — no id)`); return; }
  await call(`Delete ${label}`, 'DELETE', `${base}/${id}`, { allowFail });
}

function summarize() {
  const pass = results.filter((r) => r.ok).length;
  const hardFail = results.filter((r) => !r.ok && !r.allowFail);
  const warn = results.filter((r) => !r.ok && r.allowFail);
  console.log('\n──────────────────────────────────────────');
  console.log(`Total: ${results.length}   PASS: ${pass}   FAIL: ${hardFail.length}   WARN: ${warn.length}`);
  if (warn.length) {
    console.log('\nWARN (tolerated, data-dependent):');
    warn.forEach((r) => console.log(`  ${r.method} ${r.path} -> ${r.status} | ${r.detail}`));
  }
  if (hardFail.length) {
    console.log('\nFAILURES:');
    hardFail.forEach((r) => console.log(`  ${r.method} ${r.path} -> ${r.status} | ${r.detail}`));
  }
  console.log('──────────────────────────────────────────\n');
  process.exit(hardFail.length ? 1 : 0);
}

// Full permission matrix (every section granted) for the QA role.
const FULL = { create: true, edit: true, view: true };
const ACCESS_MATRIX = {
  job_management: FULL, vehicle_customer: FULL, appointments: FULL, payments: FULL,
  vehicle_records: FULL, file_processing: FULL, rop_integration: FULL,
  user_roles: FULL, reports_analytics: FULL,
};

(async () => {
  try {
    console.log('Seeding reusable vehicle_record in DB…');
    ctx.vehicleRecordId = await seedVehicleRecord();
    console.log(`  vehicle_record ready (id=${ctx.vehicleRecordId})`);
    await run();
  } catch (err) {
    console.error('\nFatal:', err.message || err);
    process.exit(1);
  }
})();
