/**
 * End-to-end *lifecycle* test for the IVIS backend.
 *
 * Unlike scripts/test-apis.mjs (which smoke-tests each endpoint in isolation and
 * cleans up), this drives a single realistic vehicle-inspection journey and
 * LEAVES the data in place so you can inspect it:
 *
 *   1. Masters setup        : centre -> line -> camera
 *   2. Vehicle intake       : ANPR capture (simulate_rop) auto-creates the ROP
 *                             verification AND the vehicle record
 *   3. Customer             : register the walk-in customer
 *   4. Appointment          : book the inspection slot
 *   5. Payment              : pay (status=Paid, auto_create_job) -> auto-creates Job
 *   6. Job lifecycle        : Pending -> InProgress -> Passed
 *
 * The vehicle_record id is read straight from Postgres because the system has no
 * public route to create/list vehicle records (they are produced by intake).
 *
 * Usage:  npm run test:lifecycle      (server + DB + migrations must be up;
 *         scripts/run-api-tests.sh handles that, or run it yourself)
 */
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const PORT = process.env.PORT || '4780';
const PREFIX = process.env.API_PREFIX || 'api/ivis-backend-service/v1';
const BASE = (process.env.API_BASE_URL || `http://localhost:${PORT}/${PREFIX}`).replace(/\/$/, '');
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || 'admin@ivis.local';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || 'Admin@12345';

const S = Date.now().toString().slice(-7);
const PLATE = `OM-${S}`;

let token = '';
const journey = {};
let stepNo = 0;

function db() {
  return new pg.Client({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres',
    database: process.env.POSTGRES_DB || 'ivis_backend',
  });
}

async function api(method, path, body, { auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-json */ }
  if (!res.ok) {
    const detail = json ? JSON.stringify(json.error ?? json.message ?? json) : text;
    throw new Error(`${method} ${path} -> ${res.status}: ${detail}`);
  }
  return json?.data ?? json;
}

function step(title) {
  stepNo += 1;
  console.log(`\n[${stepNo}] ${title}`);
}

function note(label, value) {
  console.log(`      ${label}: ${value}`);
}

async function run() {
  console.log(`BASE: ${BASE}`);
  console.log(`Run tag: ${S}  (plate ${PLATE})`);

  // ----- Bootstrap (first run only) + Login -------------------------------
  step('Bootstrap admin (if fresh) + login');
  try {
    await api('POST', '/auth/bootstrap', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, user_name: 'System Admin', user_code: 'ADMIN' }, { auth: false });
    note('bootstrap', 'created first admin');
  } catch {
    note('bootstrap', 'skipped (admin already exists)');
  }
  const login = await api('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }, { auth: false });
  token = login.accessToken;
  note('user', `${login.user?.email} (role: ${login.user?.role})`);

  // ----- 1. Masters setup ------------------------------------------------
  step('Masters: create Centre -> Line -> Camera');
  const centre = await api('POST', '/masters/centres', { name: `Muscat ${S}`, code: `C${S}`, description: 'Lifecycle test centre', status: 'Active' });
  journey.centre_id = centre.id; note('centre', `${centre.name} (${centre.id})`);

  const line = await api('POST', '/masters/lines', { name: `Line ${S}`, code: `L${S}`, centre_id: centre.id, display_order: 1, status: 'Active' });
  journey.line_id = line.id; note('line', `${line.name} (${line.id})`);

  const camera = await api('POST', '/masters/cameras', { name: `ANPR-IN ${S}`, code: `CAM${S}`, type: 'ANPR', line_id: line.id, status: 'Active' });
  journey.camera_id = camera.id; note('camera', `${camera.name} (${camera.id})`);

  // ----- 2. Vehicle intake: ANPR capture auto-creates ROP + vehicle record
  step('Vehicle intake: ANPR capture with simulate_rop (fetches ROP + creates vehicle record)');
  const anpr = await api('POST', '/transactions/anpr-captures', {
    plate_number: PLATE,
    normalized_plate: PLATE.replace('-', ''),
    plate_confidence: 98.4,
    capture_time: new Date().toISOString(),
    camera_id: camera.id,
    lane: line.name,
    direction: 'forward',
    country_code: 'OM',
    plate_color: 'white',
    vehicle_type: 'Sedan',
    vehicle_color: 'silver',
    verification_status: 'Pending',
    simulate_rop: true,
  });
  journey.anpr_capture_id = anpr.id;
  note('anpr capture', `${anpr.plate_number} (${anpr.id}) status=${anpr.verification_status}`);

  // ROP verification was auto-created — confirm via the API.
  const ropList = await api('GET', '/transactions/rop-verifications?page=1&limit=50');
  const rop = (ropList.data ?? ropList).find((r) => r.anpr_capture_id === anpr.id);
  if (!rop) throw new Error('Expected an auto-created ROP verification for the capture, found none');
  journey.rop_verification_id = rop.id;
  note('rop verification', `${rop.id} fetch_status=${rop.fetch_status} owner=${rop.owner_name} make=${rop.vehicle_make} ${rop.vehicle_model}`);

  // Vehicle record was auto-created — no public route, so read it from the DB.
  const client = db();
  await client.connect();
  try {
    const vr = await client.query(
      `SELECT id, vehicle_record_id, plate_number, vehicle_make, vehicle_model, chassis_no
       FROM transaction.vehicle_records WHERE plate_number = $1 AND is_deleted = false LIMIT 1`,
      [PLATE],
    );
    if (vr.rowCount === 0) throw new Error('Expected an auto-created vehicle record, found none in DB');
    journey.vehicle_record_id = vr.rows[0].id;
    note('vehicle record', `${vr.rows[0].id} (#${vr.rows[0].vehicle_record_id}) ${vr.rows[0].plate_number} ${vr.rows[0].vehicle_make} ${vr.rows[0].vehicle_model}`);
  } finally {
    await client.end();
  }

  // ----- 3. Customer -----------------------------------------------------
  step('Register customer');
  const customer = await api('POST', '/transactions/customers', {
    name: `Ahmed Al-Said ${S}`,
    phone: `+96891${S}`,
    owner_name: `Ahmed Al-Said ${S}`,
    id_number: `ID${S}`,
    plate_number: PLATE,
    plate_color: 'white',
  });
  journey.customer_id = customer.id;
  note('customer', `${customer.name} (${customer.id})`);

  // ----- 4. Appointment --------------------------------------------------
  step('Book appointment');
  const appointment = await api('POST', '/appointments', {
    customer_name: customer.name,
    customer_phone: `+96891${S}`,
    id_number: `ID${S}`,
    plate_number: PLATE,
    appointment_at: new Date(Date.now() + 86400000).toISOString(),
    status: 'Scheduled',
    sync_customer: false,
    notes: 'Lifecycle test booking',
  });
  journey.appointment_id = appointment.id;
  note('appointment', `${appointment.id} status=${appointment.status} at=${appointment.appointment_at}`);

  // ----- 5. Payment (Paid) auto-creates the Job --------------------------
  step('Take payment (status=Paid, auto_create_job) -> auto-creates Job');
  const payment = await api('POST', '/transactions/payment-transactions', {
    appointment_id: appointment.id,
    customer_id: customer.id,
    vehicle_record_id: journey.vehicle_record_id,
    anpr_capture_id: anpr.id,
    centre_id: centre.id,
    line_id: line.id,
    camera_id: camera.id,
    payment_type: 'Mix',
    status: 'Paid',
    charges: 30,
    vat: 1.5,
    grand_total: 31.5,
    pay_date: new Date().toISOString(),
    auto_create_job: true,
    job_source: 'Booked',
  });
  journey.payment_transaction_id = payment.id;
  journey.job_id = payment.job_id;
  note('payment', `${payment.id} status=${payment.status} total=${payment.grand_total}`);
  note('auto-created job', payment.job_id ?? '(none — check auto_create_job logic)');

  if (!payment.job_id) throw new Error('Payment did not auto-create a job (expected job_id on Paid payment)');

  // ----- 6. Job lifecycle: Pending -> InProgress -> Passed ---------------
  step('Drive job through its lifecycle');
  let job = await api('GET', `/jobs/${payment.job_id}`);
  note('job created', `${job.id} status=${job.status} source=${job.source}`);

  job = await api('PATCH', `/jobs/${job.id}`, { status: 'InProgress' });
  note('-> InProgress', `status=${job.status}`);

  job = await api('PATCH', `/jobs/${job.id}`, { status: 'Passed', overall_result: 'Passed' });
  note('-> Passed', `status=${job.status} result=${job.overall_result}`);

  // ----- Summary ---------------------------------------------------------
  console.log('\n──────────────────────────────────────────');
  console.log('LIFECYCLE COMPLETE — data left in place:');
  for (const [k, v] of Object.entries(journey)) console.log(`  ${k.padEnd(22)} ${v}`);
  console.log('──────────────────────────────────────────\n');
}

run().catch((err) => {
  console.error(`\n✗ Lifecycle failed at step ${stepNo}: ${err.message}\n`);
  process.exit(1);
});
