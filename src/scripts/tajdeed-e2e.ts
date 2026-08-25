import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { AppLogger } from '../common/logger/app.logger';
import { AppointmentApiClientService } from '../common/integrations/appointments/appointment-api-client.service';
import {
  appointmentApiKey,
  appointmentBaseUrl,
} from '../common/integrations/appointments/appointment.constants';
import { buildInspectionResultPayload } from '../common/integrations/appointments/inspection-result.mapper';
import {
  deriveOverallResult,
  parseIni,
} from '../common/shared/files/ini-parser.util';
import type { LaneStatusEntry } from '../common/integrations/appointments/appointment.types';
import { randomUUID } from 'crypto';

/**
 * End-to-end exercise of the appointment-provider push path against the SBX
 * integration branch.
 *
 * Deliberately split in two. Everything the PRODUCT does — the plate lookup,
 * the payload mapping, the event push, the status probe — runs through the
 * real services, so this tests our code rather than a hand-written curl. The
 * fixture setup (`/sandbox`) is called directly here, because those endpoints
 * are test scaffolding the product must never touch: their own contract says
 * production integrations must not call them.
 *
 *   npm run tajdeed:e2e -- 7385KLM
 *
 * SBX only. Writes to MSC/SEB/SHR would land in a live branch's real queue.
 */

const BRANCH = 'SBX';
const LANE = 'L1';
const PLATE_TYPE = 'PRIVATE';
const CATEGORY = 'PVT-LIGHT';

const plate = (process.argv[2] ?? '7385KLM').toUpperCase().replace(/[\s-]/g, '');

const logger = new AppLogger();
const api = new AppointmentApiClientService(logger);

let failures = 0;

function step(n: string, detail: string) {
  console.log(`\n\x1b[36m▸ ${n}\x1b[0m ${detail}`);
}

function ok(message: string) {
  console.log(`  \x1b[32m✓\x1b[0m ${message}`);
}

function bad(message: string) {
  failures += 1;
  console.log(`  \x1b[31m✗\x1b[0m ${message}`);
}

/** Direct sandbox call — fixture scaffolding, never part of the product path. */
async function sandbox(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  suffix = '',
  body?: unknown,
  withBranch = true,
): Promise<any> {
  const url = `${appointmentBaseUrl()}/sandbox${suffix}${
    withBranch ? `?branch_code=${BRANCH}` : ''
  }`;
  const res = await fetch(url, {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${appointmentApiKey()}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json().catch(() => null);
  return { httpStatus: res.status, body: json };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(
    `\n\x1b[1mTajdeed E2E\x1b[0m — plate ${plate} @ branch ${BRANCH}\n${appointmentBaseUrl()}`,
  );

  if (!appointmentApiKey()) {
    bad('APPOINTMENT_API_KEY is not set — nothing can run.');
    process.exit(1);
  }

  // 1 — connectivity and the lane directory, through the product client.
  step('1', 'GET /branches (product client)');
  const branches = await api.fetchBranches();
  if (!branches) {
    bad('Could not read the branch directory — key rejected or host down.');
    process.exit(1);
  }
  const sbx = branches.find((b) => b.branch_code === BRANCH);
  if (!sbx) {
    bad(`Branch ${BRANCH} is not visible to this key.`);
    process.exit(1);
  }
  ok(
    `${branches.length} branch(es); ${BRANCH} has lanes ${sbx.lanes
      .map((l) => l.lane_id)
      .join(', ')}`,
  );

  // 2 — clear any fixture this plate already holds. A vehicle may hold only
  // one active booking globally, so a leftover from an earlier run would make
  // the create fail rather than the test.
  step('2', `Clearing existing ${BRANCH} fixtures for ${plate}`);
  const existing = await sandbox('GET');
  const mine = (existing.body?.bookings ?? []).filter(
    (b: any) => b.plate_number === plate,
  );
  for (const b of mine) {
    await sandbox('DELETE', `/${b.booking_id}`, undefined, false);
    ok(`removed ${b.booking_id}`);
  }
  if (mine.length === 0) ok('none held');

  // 3 — create the booking.
  step('3', 'POST /sandbox — create booking');
  const created = await sandbox('POST', '', {
    plate_number: plate,
    plate_type: PLATE_TYPE,
    category: CATEGORY,
    appointment_time: '09:15',
    status: 'CONFIRMED',
    vehicle_make: 'TOYOTA',
    vehicle_model: 'LAND CRUISER',
    vehicle_year: 2022,
    vehicle_color: 'WHITE',
    customer_name: 'IVIS E2E',
    customer_phone: '+96891234567',
  });
  const bookingId = created.body?.appointment?.booking_id;
  if (!bookingId) {
    bad(
      `Create failed: HTTP ${created.httpStatus} ${JSON.stringify(created.body)}`,
    );
    process.exit(1);
  }
  ok(
    `${bookingId} — ${created.body.appointment.payment_status}, fee ${created.body.appointment.fee_amount} ${created.body.appointment.currency}`,
  );

  // 4 — check in, then take the lane. One step at a time: their contract
  // refuses CONFIRMED → IN_PROGRESS outright.
  step('4', 'PATCH /sandbox — CHECKED_IN then IN_PROGRESS');
  const checkedIn = await sandbox(
    'PATCH',
    `/${bookingId}`,
    { status: 'CHECKED_IN' },
    false,
  );
  if (checkedIn.body?.appointment?.status !== 'CHECKED_IN') {
    bad(`Check-in failed: ${JSON.stringify(checkedIn.body)}`);
  } else {
    ok(`CHECKED_IN at ${checkedIn.body.appointment.checked_in_at}`);
  }

  const inProgress = await sandbox(
    'PATCH',
    `/${bookingId}`,
    { status: 'IN_PROGRESS', assigned_lane: LANE },
    false,
  );
  if (inProgress.body?.appointment?.status !== 'IN_PROGRESS') {
    bad(`Lane assignment failed: ${JSON.stringify(inProgress.body)}`);
  } else {
    ok(`IN_PROGRESS on lane ${inProgress.body.appointment.assigned_lane}`);
  }

  // 5 — the lane lookup the ANPR path uses, through the product client.
  step('5', 'GET /appointments/by-plate (product client)');
  const atLane = await api.findByPlate(BRANCH, PLATE_TYPE, plate);
  if (!atLane) {
    bad('Plate lookup returned nothing — the vehicle should be at the lane.');
  } else {
    ok(
      `matched ${atLane.plate_number}, slot ${atLane.appointment_at}, customer ${atLane.customer_name}`,
    );
  }

  // 6 — LANE_STATUS OCCUPIED, exactly as job Start raises it.
  step('6', 'POST /events — LANE_STATUS OCCUPIED (product client)');
  const laneEntry: LaneStatusEntry = {
    lane_id: LANE,
    status: 'OCCUPIED',
    plate_number: plate,
    started_at: new Date().toISOString(),
  };
  const laneTxn = randomUUID();
  const lanePush = await api.pushEvent({
    event_type: 'LANE_STATUS',
    transaction_id: laneTxn,
    branch_code: BRANCH,
    timestamp: new Date().toISOString(),
    payload: laneEntry,
  });
  if (!lanePush.ok) {
    bad(`Lane push refused: ${lanePush.reason}`);
  } else {
    ok(`accepted ${laneTxn}`);
    console.log(
      `    raw: ${JSON.stringify(lanePush.response ?? null)}`,
    );
  }

  // 7 — build the inspection result from a real Admin PC OUT file, through the
  // real mapper. The sample file is another vehicle's; only the readings
  // matter, so the plate is overridden with the one under test.
  step('7', 'Mapping a real OUT file → INSPECTION_RESULT payload');
  const samplePath = path.resolve(
    __dirname,
    '../../../outfileformat_fromadminpc_5328-VED.res.txt',
  );
  if (!fs.existsSync(samplePath)) {
    bad(`Sample OUT file not found at ${samplePath}`);
    process.exit(1);
  }
  const sections = parseIni(fs.readFileSync(samplePath, 'utf8'));
  const overall = deriveOverallResult(sections);
  const payload = buildInspectionResultPayload({
    sections,
    overallResult: overall,
    plateNumber: plate,
    plateType: PLATE_TYPE,
    laneId: LANE,
    jobNumber: 9001,
  });
  ok(
    `overall ${overall ?? 'unknown'} → ${payload.overall_result}; blocks: ${Object.keys(
      payload,
    )
      .filter((k) => typeof (payload as any)[k] === 'object')
      .join(', ') || 'none'}`,
  );
  console.log(`    ${JSON.stringify(payload)}`);

  // 8 — push it, through the product client.
  step('8', 'POST /events — INSPECTION_RESULT (product client)');
  const txn = randomUUID();
  const push = await api.pushEvent({
    event_type: 'INSPECTION_RESULT',
    transaction_id: txn,
    branch_code: BRANCH,
    timestamp: new Date().toISOString(),
    payload,
  });
  if (!push.ok) {
    bad(`Push refused: ${push.reason}`);
    console.log(`    raw: ${JSON.stringify(push.response ?? null)}`);
    process.exit(1);
  }
  ok(`accepted ${txn}${push.duplicate ? ' (duplicate)' : ''}`);
  console.log(`    raw: ${JSON.stringify(push.response ?? null)}`);

  // 9 — idempotency: the same id again must answer E0007 and change nothing.
  step('9', 'Re-pushing the same transaction_id (idempotency)');
  const again = await api.pushEvent({
    event_type: 'INSPECTION_RESULT',
    transaction_id: txn,
    branch_code: BRANCH,
    timestamp: new Date().toISOString(),
    payload,
  });
  if (again.ok && again.duplicate) {
    ok('E0007 duplicate — treated as delivered, exactly as the outbox expects');
  } else {
    bad(`Expected a duplicate, got ${JSON.stringify(again)}`);
  }

  // 10 — what their worker did with it. 202 only meant queued.
  step('10', 'GET /events/:txn/status until terminal (product client)');
  let status: string | undefined;
  let detail: any = null;
  for (let attempt = 1; attempt <= 10; attempt++) {
    await sleep(2000);
    detail = await api.fetchEventStatus(txn);
    status = detail?.event_status;
    console.log(`    attempt ${attempt}: ${status ?? 'no answer'}`);
    if (status === 'PROCESSED' || status === 'FAILED') break;
  }
  if (status === 'PROCESSED') {
    ok(`PROCESSED at ${detail?.processed_at}`);
  } else if (status === 'FAILED') {
    bad(`Provider REJECTED it: ${detail?.error_message}`);
  } else {
    bad(`Never reached a terminal state (last: ${status ?? 'none'})`);
  }
  console.log(`    raw: ${JSON.stringify(detail)}`);

  // 11 — the reconcile sweep the dispatcher's confirm loop uses.
  step('11', 'POST /reconcile — both transactions (product client)');
  const sweep = await api.reconcile([txn, laneTxn]);
  if (!sweep) {
    bad('Reconcile returned nothing.');
  } else {
    for (const r of sweep) {
      console.log(`    ${r.transaction_id} → ${r.event_status}`);
    }
    ok(`${sweep.length} result(s)`);
  }

  // 12 — the result, not an API call, is what completes the booking.
  step('12', 'GET /appointments/:booking_id — final state (product client)');
  const finalBooking = await api.fetchByBookingId(bookingId);
  if (!finalBooking) {
    bad('Booking could not be read back.');
  } else if (finalBooking.status === 'COMPLETED') {
    ok(`${bookingId} is COMPLETED — the result landed.`);
  } else {
    bad(`Expected COMPLETED, booking is ${finalBooking.status}`);
  }

  // 13 — release the lane, as job Submit does.
  step('13', 'POST /events — LANE_STATUS IDLE (product client)');
  const idlePush = await api.pushEvent({
    event_type: 'LANE_STATUS',
    transaction_id: randomUUID(),
    branch_code: BRANCH,
    timestamp: new Date().toISOString(),
    payload: {
      lane_id: LANE,
      status: 'IDLE',
      cleared_at: new Date().toISOString(),
    },
  });
  idlePush.ok ? ok('lane released') : bad(`Lane release refused: ${idlePush.reason}`);

  console.log(
    failures === 0
      ? `\n\x1b[32m\x1b[1mPASS\x1b[0m — end to end, ${plate} → ${bookingId} → COMPLETED\n`
      : `\n\x1b[31m\x1b[1m${failures} step(s) failed\x1b[0m\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
