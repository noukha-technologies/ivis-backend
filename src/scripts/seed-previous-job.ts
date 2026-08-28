/**
 * Seeds a complete PAST visit for a plate, so today's arrival is a re-test.
 *
 * Writes the whole chain a real visit leaves behind — ANPR capture, ROP
 * verification, customer, appointment, settled payment and a Completed job —
 * all dated in the past. Producing that by hand means booking, paying,
 * converting, writing an IN file, waiting for an OUT file and submitting to
 * ROP, which is a lot of work to arrive at a precondition.
 *
 * Usage:
 *   npm run seed:previous-job -- 3947VWX
 *   npm run seed:previous-job -- 3947VWX --days 7
 *   npm run seed:previous-job -- 3947VWX --days 30 --result Passed
 *   npm run seed:previous-job -- 3947VWX --owner "Salim Al Habsi" --phone 92741658
 *
 * Options (all optional):
 *   --days   N        how many days ago the visit happened (default 3)
 *   --result Passed   Passed | Failed (default Failed)
 *   --owner  "Name"   owner / driver name
 *   --phone  9xxxxxxx owner phone, 8 digits
 *
 * Everything is backdated together, so the seeded visit is genuinely a
 * different day from today's — which is what the re-test lookup, the same-day
 * ROP rule and the capture matcher all key on.
 *
 * Re-runnable: the vehicle and customer are reused when the plate is already
 * known, so a second run adds a second past visit rather than duplicate
 * vehicles. Run it twice to test a chain of returns.
 *
 * A script rather than an endpoint on purpose: it fabricates a completed,
 * ROP-filed inspection, which is not something a running system should offer
 * over HTTP. It refuses to run against production.
 */

import 'reflect-metadata';
import { loadEnv } from '../common/config/env.config';
import { AppDataSource } from '../modules/database/data-source';
import { generateSnowflakeId } from '../common/shared/snowflakeIdGeneration';
import { Job } from '../modules/database/entity/job.entity';
import { Customer } from '../modules/database/entity/customer.entity';
import { VehicleRecord } from '../modules/database/entity/vehicle-record.entity';
import { AnprCapture } from '../modules/database/entity/anpr-capture.entity';
import { RopVerification } from '../modules/database/entity/rop-verification.entity';
import { Appointment } from '../modules/database/entity/appointment.entity';
import { Payments } from '../modules/database/entity/payments.entity';
import { Camera } from '../modules/database/entity/camera.entity';
import { Line } from '../modules/database/entity/line.entity';
import {
  AppointmentStatus,
  BookingType,
  RopVerificationStatus,
} from '../common/enums/common.enums';
import { AnprCaptureStatus } from '../common/enums/camera.enums';
import { PaymentStatusEnum } from '../common/enums/payment.enums';
import type { JobOverallResult } from '../common/enums/job.enums';

loadEnv();

const CREATED_BY = 'seed-previous-job';

type Options = {
  plate: string;
  daysAgo: number;
  result: JobOverallResult;
  ownerName: string;
  ownerPhone: string;
};

function parseArgs(): Options {
  const argv = process.argv.slice(2);
  const plate = argv[0]?.trim().toUpperCase();
  if (!plate || plate.startsWith('--')) {
    throw new Error(
      'Plate number is required.\n' +
        '  npm run seed:previous-job -- 3947VWX [--days 3] [--result Failed] [--owner "Name"] [--phone 9xxxxxxx]',
    );
  }

  const flag = (name: string): string | undefined => {
    const at = argv.indexOf(`--${name}`);
    return at === -1 ? undefined : argv[at + 1];
  };

  const daysAgo = Number(flag('days') ?? 3);
  if (!Number.isInteger(daysAgo) || daysAgo < 1) {
    throw new Error('--days must be a whole number of days, at least 1.');
  }

  const result = (flag('result')?.trim() ?? 'Failed') as JobOverallResult;
  if (result !== 'Passed' && result !== 'Failed') {
    throw new Error(`--result must be Passed or Failed, got "${result}".`);
  }

  return {
    plate,
    daysAgo,
    result,
    ownerName: flag('owner')?.trim() || 'Seeded Owner',
    ownerPhone: flag('phone')?.trim() || '90000000',
  };
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Refusing to run against production — this fabricates a completed inspection.',
    );
  }

  const { plate, daysAgo, result, ownerName, ownerPhone } = parseArgs();
  const ds = await AppDataSource.initialize();

  try {
    // The whole visit happens on one past day: arrival, verification,
    // registration, payment and the test, twenty minutes apart.
    const visitDay = new Date();
    visitDay.setDate(visitDay.getDate() - daysAgo);
    visitDay.setHours(10, 0, 0, 0);
    const at = (minutes: number): Date =>
      new Date(visitDay.getTime() + minutes * 60_000);

    const vehicleRepo = ds.getRepository(VehicleRecord);
    const customerRepo = ds.getRepository(Customer);
    const jobRepo = ds.getRepository(Job);

    // ── the lane the car came in on
    //
    // A capture cannot exist without a camera — the column is NOT NULL — so an
    // unconfigured database cannot be seeded with ANPR data. The rest of the
    // chain still works; only the capture and its links are skipped.
    const camera = await ds.getRepository(Camera).findOne({
      where: { is_deleted: false },
      order: { created_at: 'ASC' },
    });
    const line = camera?.line_id
      ? await ds
          .getRepository(Line)
          .findOne({ where: { id: camera.line_id, is_deleted: false } })
      : null;
    if (!camera) {
      console.log(
        'camera          none    — no camera configured, seeding without an ANPR capture',
      );
    }

    // ── the vehicle
    let vehicle = await vehicleRepo.findOne({
      where: { plate_number: plate, is_deleted: false },
    });
    if (vehicle) {
      console.log(
        `vehicle record  reused  #${vehicle.vehicle_record_id} (${plate})`,
      );
    } else {
      vehicle = await vehicleRepo.save(
        vehicleRepo.create({
          id: generateSnowflakeId(),
          vehicle_record_id: await nextSequence(
            ds,
            'vehicle_records',
            'vehicle_record_id',
          ),
          plate_number: plate,
          vehicle_type: 'Sedan',
          vehicle_make: 'Toyota',
          vehicle_model: 'Corolla',
          plate_color: 'Yellow',
          vehicle_color: 'White',
          chassis_no: 'SEED0000000000000',
          created_by: CREATED_BY,
        }),
      );
      console.log(
        `vehicle record  created #${vehicle.vehicle_record_id} (${plate})`,
      );
    }

    // ── the owner
    let customer = await customerRepo.findOne({
      where: { vehicle_record_id: vehicle.id, is_deleted: false },
    });
    if (customer) {
      console.log(
        `customer        reused  #${customer.customer_id} (${customer.owner_name})`,
      );
    } else {
      customer = await customerRepo.save(
        customerRepo.create({
          id: generateSnowflakeId(),
          customer_id: await nextSequence(ds, 'customers', 'customer_id'),
          owner_name: ownerName,
          owner_phone_number: ownerPhone,
          driver_name: ownerName,
          driver_phone_number: ownerPhone,
          mulkiya_id: '1234567890A',
          chassis_no: vehicle.chassis_no,
          vehicle_record_id: vehicle.id,
          created_by: CREATED_BY,
        }),
      );
      console.log(
        `customer        created #${customer.customer_id} (${ownerName})`,
      );
    }

    // ── the arrival
    let capture: AnprCapture | null = null;
    if (camera) {
      const captureRepo = ds.getRepository(AnprCapture);
      const draft = captureRepo.create({
        id: generateSnowflakeId(),
        anpr_capture_id: await nextSequence(
          ds,
          'anpr_captures',
          'anpr_capture_id',
        ),
        plate_number: plate,
        capture_time: at(0),
        camera_id: camera.id,
        line_id: camera.line_id ?? null,
        status: AnprCaptureStatus.VALIDATED,
        plate_confidence: 96,
        vehicle_type: 'Sedan',
        vehicle_color: 'White',
        plate_color: 'Yellow',
        created_by: CREATED_BY,
        created_at: at(0),
      });
      capture = await captureRepo.save(draft);
      console.log(
        `anpr capture    created #${capture.anpr_capture_id} on ${camera.cameraCode ?? camera.id}`,
      );
    }

    // ── what ROP said about it
    const rop = await ds.getRepository(RopVerification).save(
      ds.getRepository(RopVerification).create({
        id: generateSnowflakeId(),
        rop_verification_id: await nextSequence(
          ds,
          'rop_verifications',
          'rop_verification_id',
        ),
        anpr_capture_id: capture?.id ?? null,
        reg_no: plate,
        owner_name: ownerName,
        owner_phone: ownerPhone,
        mulkiya_id: '1234567890A',
        chassis_no: vehicle.chassis_no,
        vehicle_make: vehicle.vehicle_make,
        vehicle_model: vehicle.vehicle_model,
        vehicle_type: vehicle.vehicle_type,
        plate_color: vehicle.plate_color,
        vehicle_color: vehicle.vehicle_color,
        fetch_status: RopVerificationStatus.VALIDATED,
        fetched_at: at(2),
        created_by: CREATED_BY,
        created_at: at(2),
      }),
    );
    console.log(
      `rop verification created #${rop.rop_verification_id} — Fetched`,
    );

    // ── the registration, already converted
    const appointment = await ds.getRepository(Appointment).save(
      ds.getRepository(Appointment).create({
        id: generateSnowflakeId(),
        appointment_id: await nextSequence(
          ds,
          'appointments',
          'appointment_id',
        ),
        anpr_capture_id: capture?.id ?? null,
        rop_verification_id: rop.id,
        customer_id: customer.id,
        vehicle_record_id: vehicle.id,
        centre_id: line?.centre_id ?? null,
        line_id: camera?.line_id ?? null,
        booking_type: BookingType.WALK_IN,
        status: AppointmentStatus.CONVERTED,
        appointment_at: at(5),
        created_by: CREATED_BY,
        created_at: at(5),
      }),
    );
    console.log(
      `appointment     created #${appointment.appointment_id} — Converted`,
    );

    // ── the fee, settled
    const payment = await ds.getRepository(Payments).save(
      ds.getRepository(Payments).create({
        id: generateSnowflakeId(),
        payment_id: await nextSequence(ds, 'payments', 'payment_id'),
        appointment_id: appointment.id,
        customer_id: customer.id,
        vehicle_record_id: vehicle.id,
        status: PaymentStatusEnum.PAID,
        grand_total: 21,
        pay_date: at(8),
        created_by: CREATED_BY,
        created_at: at(8),
      }),
    );
    console.log(`payment         created #${payment.payment_id} — Paid 21.000`);

    // ── the inspection itself
    //
    // Completed is the state that matters: submitJob sets the status and files
    // the result with ROP together, so a Completed job is by definition one
    // whose result is with ROP. That is what the re-test lookup keys on.
    const job = await jobRepo.save(
      jobRepo.create({
        id: generateSnowflakeId(),
        job_id: await nextSequence(ds, 'jobs', 'job_id'),
        appointment_id: appointment.id,
        anpr_capture_id: capture?.id ?? null,
        customer_id: customer.id,
        vehicle_record_id: vehicle.id,
        centre_id: line?.centre_id ?? null,
        line_id: camera?.line_id ?? null,
        status: 'Completed',
        job_type: 'Test',
        previous_job_id: null,
        overall_result: result,
        started_at: at(12),
        completed_at: at(32),
        created_by: CREATED_BY,
        created_at: at(10),
      }),
    );
    // Close the loop the converter would have closed.
    await ds.getRepository(Payments).update(payment.id, { job_id: job.id });

    console.log(
      `job             created #J${job.job_id} — Completed / ${result}`,
    );
    console.log('');
    console.log(
      `${plate} has a finished visit on ${visitDay.toDateString()} (${daysAgo} day(s) ago).`,
    );
    console.log('The next job raised for this plate will be a Re-test.');
  } finally {
    await ds.destroy();
  }
}

/**
 * Next value for a table's human-facing sequential id.
 *
 * These are MAX()+1 columns rather than real sequences (see the DAOs), so the
 * script has to follow the same convention or it writes a duplicate id.
 */
async function nextSequence(
  ds: typeof AppDataSource,
  table: string,
  column: string,
): Promise<number> {
  const rows: Array<{ max: string | null }> = await ds.query(
    `SELECT MAX("${column}") AS max FROM "transaction"."${table}"`,
  );
  return (rows[0]?.max ? Number(rows[0].max) : 0) + 1;
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error((err as Error).message);
    process.exit(1);
  });
