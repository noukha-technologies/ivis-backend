import { BadRequestException, Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import { CreateJobDto, UpdateJobDto } from '../../../common/dto/job.dto';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../common/interfaces/pagination.interface';
import {
  DatabaseException,
  DuplicateResourceException,
  ResourceNotFoundException,
} from '../../../common/exceptions/custom.exception';
import { AppLogger } from '../../../common/logger/app.logger';
import type { UserContext } from '../../../common/dto/auth.dto';
import { getCreatedById } from '../../../common/utils/created-by.util';
import { OmanTimeZone } from '../../../common/utils/util';
import { generateSnowflakeId } from '../../../common/shared/snowflakeIdGeneration';
import { patchAuditContext } from '../../../common/audit/audit-context';
import {
  AppointmentStatus,
  RopVerificationStatus,
  TajdeedEventType,
} from '../../../common/enums/common.enums';
import { AdminPcDao } from '../../database/dao/admin-pc.dao';
import { AnprCaptureDao } from '../../database/dao/anpr-capture.dao';
import { AppointmentDao } from '../../database/dao/appointment.dao';
import { AppointmentBookingDao } from '../../database/dao/appointment-booking.dao';
import { CameraDao } from '../../database/dao/camera.dao';
import { CentreDao } from '../../database/dao/centre.dao';
import { ChargeDao } from '../../database/dao/charge.dao';
import { CustomerDao } from '../../database/dao/customer.dao';
import { JobDao } from '../../database/dao/job.dao';
import { JobImageDao } from '../../database/dao/job-image.dao';
import { LineDao } from '../../database/dao/line.dao';
import { PaymentsDao } from '../../database/dao/payments.dao';
import { UsersDao } from '../../database/dao/users.dao';
import { VehicleRecordDao } from '../../database/dao/vehicle-record.dao';
import { PaymentApiClientService } from '../../../common/integrations/payment/payment-api-client.service';
import { RopApiClientService } from '../../../common/integrations/rop/rop-api-client.service';
import { InfileGeneratorService } from './infile-generator.service';
import { TajdeedOutboxService } from '../../transactions/tajdeed-events/services/tajdeed-outbox.service';
import { LaneStatusService } from '../../transactions/tajdeed-events/services/lane-status.service';
import { buildInspectionResultPayload } from '../../../common/integrations/appointments/inspection-result.mapper';
import { Job } from '../../database/entity/job.entity';
import { Charge } from '../../database/entity/charge.entity';

/** Resolved invoice pricing for a job (Invoice Details stage). */
export interface JobPricingResult {
  charge_missing: boolean;
  vehicle_type: string | null;
  charge_category_id: string | null;
  /** The Charges-master row this price came from. Null when none matched. */
  charge_id?: string | null;
  /**
   * The vehicle's OWN type when an operator mapping was used instead of it —
   * e.g. "sedan" on a job priced as SUV. Null on an unmapped job, so its
   * presence is exactly "this price came from a mapping".
   */
  mapped_from_vehicle_type?: string | null;
  center_charges: number;
  rop_charges: number;
  vat_percent: number;
  grand_total: number;
  advance: number;
  payable: number;
  /** The payments_id that will be generated for this job's next payment. */
  next_payment_id: number;
}

/** Denormalized Job Management list fields for audit snapshots. */
type JobAuditDetails = {
  plate_number?: string | null;
  customer_name?: string | null;
  booking_type?: string | null;
};

@Injectable()
export class JobService {
  private static readonly context = 'JobService';

  constructor(
    private readonly jobDao: JobDao,
    private readonly jobImageDao: JobImageDao,
    private readonly customerDao: CustomerDao,
    private readonly vehicleRecordDao: VehicleRecordDao,
    private readonly appointmentDao: AppointmentDao,
    private readonly bookingDao: AppointmentBookingDao,
    private readonly anprCaptureDao: AnprCaptureDao,
    private readonly chargeDao: ChargeDao,
    private readonly centreDao: CentreDao,
    private readonly lineDao: LineDao,
    private readonly adminPcDao: AdminPcDao,
    private readonly cameraDao: CameraDao,
    private readonly paymentsDao: PaymentsDao,
    private readonly usersDao: UsersDao,
    private readonly paymentApi: PaymentApiClientService,
    private readonly ropApi: RopApiClientService,
    private readonly infileGenerator: InfileGeneratorService,
    private readonly outbox: TajdeedOutboxService,
    private readonly laneStatus: LaneStatusService,
    private readonly logger: AppLogger,
  ) {}

  private isSameOmanDay(a: Date, b: Date): boolean {
    const fmt = (d: Date) =>
      new Intl.DateTimeFormat('en-CA', {
        timeZone: OmanTimeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(d);
    return fmt(a) === fmt(b);
  }

  /** Submit & Print — submit the result to ROP (same-day only) and complete. */
  async submitJob(id: string): Promise<Job> {
    const job = await this.findOne(id);
    if (!this.isSameOmanDay(new Date(job.created_at), new Date())) {
      throw new BadRequestException(
        'ROP submission must be on the same day the job was created',
      );
    }
    await this.ropApi.submitInspection(
      job.vehicleRecord?.plate_number ?? '',
      job.overall_result ?? 'Passed',
    );
    const submitted = await this.update(id, {
      status: 'Completed',
      completed_at: new Date().toISOString(),
    });

    // Order matters: the result is recorded against the lane while it is still
    // occupied, and only then is the lane released. Both queue in creation
    // order, so the outbox drains them the same way.
    await this.queueInspectionResult(job);
    await this.laneStatus.pushLaneChange(submitted, 'IDLE');

    return submitted;
  }

  /**
   * Queues the inspection result for the appointment provider.
   *
   * Queued, never sent inline: the provider completing a booking is their work
   * to do asynchronously, and an outage on their side must not fail the
   * operator's Submit. Every failure here is swallowed for the same reason —
   * the job IS submitted, and losing the push is a delivery problem for the
   * outbox to surface, not grounds for rejecting a completed inspection.
   */
  private async queueInspectionResult(job: Job): Promise<void> {
    try {
      // Only bookings the provider already knows about. A walk-in has no
      // booking on their side, so an event for it can only ever come back
      // FAILED — there is nothing there to match it to.
      //
      // This is the ONLY reason it is correct for a completed job to file
      // nothing. Every other early return below is a fault, and is logged as
      // one, because on the job screen they are indistinguishable: a job with
      // no queued event renders the same whether there was nothing to send or
      // we were unable to send it.
      if (!job.appointment_id) {
        this.logger.debug(
          `Job ${job.id} has no appointment (walk-in) — no inspection result to file`,
          JobService.context,
        );
        return;
      }

      const appointment = await this.appointmentDao.findActiveById(
        job.appointment_id,
      );
      const bookingId = appointment?.provider_booking_id?.trim();
      if (!bookingId) {
        this.logger.debug(
          `Job ${job.id} is linked to appointment ${job.appointment_id}, which the provider holds no booking for — nothing to file`,
          JobService.context,
        );
        return;
      }

      if (!job.test_results) {
        this.logger.warn(
          `Job ${job.id} submitted with no OUT-file results — nothing to push to the provider`,
          JobService.context,
        );
        return;
      }

      const centre = job.centre_id
        ? await this.centreDao.findActiveById(job.centre_id)
        : null;
      const branchCode = centre?.provider_branch_code?.trim();
      if (!branchCode) {
        // A real booking that cannot be filed: the provider routes events by
        // branch, so without the mapping there is no address to send to. Warn
        // rather than return quietly — this is a centre that was never mapped,
        // and left silent it looks exactly like a walk-in on every screen.
        this.logger.warn(
          `Job ${job.id} holds provider booking ${bookingId} but centre ${job.centre_id ?? 'n/a'} has no provider branch code — the inspection result cannot be filed. Map the centre to a provider branch.`,
          JobService.context,
        );
        return;
      }

      // plate_type is not on the appointment — it lives on the raw booking the
      // provider sent us. Without it a plate shared by two plate types matches
      // two vehicles and the event fails rather than guessing, so it is worth
      // the extra read.
      const booking = await this.bookingDao.findByBookingId(bookingId);
      const line = job.line_id
        ? await this.lineDao.findActiveById(job.line_id)
        : null;

      const payload = buildInspectionResultPayload({
        sections: job.test_results as Record<string, Record<string, string>>,
        overallResult: job.overall_result,
        plateNumber:
          job.vehicleRecord?.plate_number ?? booking?.plate_number ?? '',
        plateType: booking?.plate_type ?? null,
        laneId: line?.provider_lane_id ?? appointment?.assigned_lane ?? null,
        jobNumber: job.job_id,
      });

      if (!payload.plate_number) {
        this.logger.warn(
          `Job ${job.id} has no plate number — cannot push an inspection result`,
          JobService.context,
        );
        return;
      }

      await this.outbox.enqueue({
        eventType: TajdeedEventType.INSPECTION_RESULT,
        branchCode,
        payload,
        jobId: job.id,
        centreId: job.centre_id ?? null,
        lineId: job.line_id ?? null,
      });
    } catch (err) {
      this.logger.error(
        `Failed to queue inspection result for job ${job.id}: ${(err as Error).message}`,
        (err as Error).stack,
        JobService.context,
      );
    }
  }

  /** Redo Test — flag the job's overall result as Redo. */
  async redoJob(id: string): Promise<Job> {
    return this.update(id, { overall_result: 'Redo' });
  }

  /**
   * Start the inspection: generate the IN file to the Admin PC folder and move
   * the job to In Progress (records IN file name/path + started_at).
   */
  async startJob(id: string): Promise<Job> {
    const job = await this.findOne(id);
    const { name, path } = await this.infileGenerator.generateForJob(job);
    const started = await this.update(id, {
      status: 'In Progress',
      infile_name: name,
      infile_path: path,
      started_at: new Date().toISOString(),
    });

    // The vehicle is physically on the lane now. Told to the provider as it
    // happens rather than waiting for the 5-minute snapshot, which would leave
    // their lane board showing this lane free while a car occupies it.
    await this.laneStatus.pushLaneChange(started, 'OCCUPIED');

    return started;
  }

  async create(createDto: CreateJobDto, actor: UserContext): Promise<Job> {
    this.logger.log(
      `Creating job for customer: ${createDto.customer_id}`,
      JobService.context,
    );

    try {
      await this.validateJobReferences(createDto);

      let jobId = createDto.job_id;
      if (!jobId) {
        jobId = await this.jobDao.getNextJobId();
      } else {
        const existing = await this.jobDao.findByJobId(jobId);
        if (existing) {
          throw new DuplicateResourceException('Job', 'job_id', jobId);
        }
      }

      const job = this.jobDao.create({
        id: generateSnowflakeId(),
        job_id: jobId,
        appointment_id: createDto.appointment_id ?? null,
        status: createDto.status || 'Pending',
        customer_id: createDto.customer_id,
        vehicle_record_id: createDto.vehicle_record_id,
        anpr_capture_id: createDto.anpr_capture_id,
        centre_id: createDto.centre_id,
        line_id: createDto.line_id,
        admin_pc_id: createDto.admin_pc_id,
        camera_id: createDto.camera_id,
        created_by: getCreatedById(actor),
      });

      const auditDetails = await this.resolveJobAuditDetails({
        customer_id: createDto.customer_id,
        vehicle_record_id: createDto.vehicle_record_id,
        appointment_id: createDto.appointment_id,
      });
      Object.assign(job, auditDetails);
      patchAuditContext({ jobAuditDetails: { ...auditDetails } });

      try {
        const saved = await this.jobDao.save(job);
        this.logger.log(`Job created with ID: ${saved.id}`, JobService.context);
        return (await this.jobDao.findActiveById(saved.id)) ?? saved;
      } finally {
        patchAuditContext({
          jobAuditDetails: null,
          jobAuditDetailsBefore: null,
        });
      }
    } catch (error) {
      if (
        error instanceof DuplicateResourceException ||
        error instanceof ResourceNotFoundException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to create job: ${(error as Error).message}`,
        (error as Error).stack,
        JobService.context,
      );
      throw new DatabaseException('Failed to create job. Please try again.');
    }
  }

  /**
   * Create a Job from a queued walk-in appointment. Requires the appointment to
   * already have a linked customer (operator entered details). Ensures a vehicle
   * record exists (by plate), creates the job (Pending), and marks the
   * appointment Converted.
   */
  async createFromAppointment(
    appointmentId: string,
    actor: UserContext,
    assignment?: { line_id: string; assigned_user_id: string },
  ): Promise<Job> {
    this.logger.log(
      `Converting appointment ${appointmentId} to a job`,
      JobService.context,
    );

    const appt = await this.appointmentDao.findActiveById(appointmentId);
    if (!appt) {
      throw new ResourceNotFoundException('Appointment', appointmentId);
    }
    if (appt.status === AppointmentStatus.CONVERTED) {
      throw new BadRequestException(
        'Appointment has already been converted to a job',
      );
    }
    if (!appt.customer_id) {
      throw new BadRequestException(
        'Enter customer details before converting to a job',
      );
    }

    // A job records an inspection of a vehicle that is physically here. The
    // ANPR capture is the evidence it arrived and the plate was read at the
    // lane; without one, a booking made days ago could become a job for a car
    // that never turned up. Online bookings are the risk — they exist in the
    // queue long before arrival — so this is enforced here rather than relying
    // on the UI hiding a button.
    if (!appt.anpr_capture_id) {
      throw new BadRequestException(
        'The vehicle has not been captured at a lane yet. Wait for the ANPR reading before converting.',
      );
    }

    // ROP is the government record for the vehicle and its owner. Converting
    // before it is Fetched would start an inspection on unverified details,
    // and the result is submitted back to ROP under them.
    const ropStatus = appt.ropVerification?.fetch_status;
    if (ropStatus !== RopVerificationStatus.VALIDATED) {
      throw new BadRequestException(
        ropStatus === RopVerificationStatus.FAILED
          ? 'ROP verification failed for this vehicle. Resolve it before converting to a job.'
          : 'ROP verification is still pending. Wait for it to complete before converting to a job.',
      );
    }

    // Ensure a vehicle record exists for the plate (jobs require one). Plate +
    // vehicle type are read from the appointment's relations (record / ANPR).
    let vehicleRecordId = appt.vehicle_record_id ?? null;
    if (!vehicleRecordId) {
      const plate = (
        appt.vehicleRecord?.plate_number ?? appt.anprCapture?.plate_number
      )?.trim();
      if (!plate) {
        throw new BadRequestException('Appointment has no plate number');
      }
      let record = await this.vehicleRecordDao.findByPlateNumber(plate);
      if (!record) {
        record = await this.vehicleRecordDao.save(
          this.vehicleRecordDao.create({
            id: generateSnowflakeId(),
            vehicle_record_id:
              await this.vehicleRecordDao.getNextVehicleRecordId(),
            plate_number: plate,
            vehicle_type:
              appt.vehicleRecord?.vehicle_type ??
              appt.anprCapture?.vehicle_type ??
              undefined,
            created_by: getCreatedById(actor),
          }),
        );
      }
      vehicleRecordId = record.id;
    }

    const resolvedCentreId =
      appt.centre_id ?? actor.user.center_id ?? undefined;

    // Every job runs on a line and belongs to someone: the IN file is written
    // to the line's folder, and the result comes back against that lane. A job
    // with neither is unworkable, so both are required rather than inferred.
    const lineId = assignment?.line_id ?? appt.line_id ?? undefined;
    if (!lineId) {
      throw new BadRequestException(
        'Select the line this job will run on before converting.',
      );
    }
    if (!assignment?.assigned_user_id) {
      throw new BadRequestException(
        'Select the user responsible for this job before converting.',
      );
    }

    // The chosen user must actually be mapped to the chosen line — the picker
    // enforces this, but the endpoint is reachable directly.
    const assignable = await this.usersDao.findActiveByLineId(lineId);
    if (!assignable.some((u) => u.id === assignment.assigned_user_id)) {
      throw new BadRequestException(
        'The selected user is not assigned to that line.',
      );
    }

    const job = await this.create(
      {
        appointment_id: appt.id,
        status: 'Pending',
        customer_id: appt.customer_id,
        vehicle_record_id: vehicleRecordId,
        centre_id: resolvedCentreId,
        line_id: lineId,
        assigned_user_id: assignment.assigned_user_id,
        anpr_capture_id: appt.anpr_capture_id ?? undefined,
      },
      actor,
    );

    await this.appointmentDao.save(
      this.appointmentDao.merge(appt, { status: AppointmentStatus.CONVERTED }),
    );

    // An online booking already carries a settled payment, recorded at ingest
    // with no job attached. Link that row rather than creating another — the
    // unique index on payments.job_id enforces one payment per job.
    await this.linkExistingPaymentToJob(appt.id, job.id);

    return job;
  }

  /**
   * Attaches an appointment's pre-existing payment to the job it became.
   *
   * Only online bookings have one: the provider settles payment days ahead, so
   * the payment exists before the vehicle arrives. Walk-ins are unaffected —
   * their payment is still created by the operator at job time.
   */
  private async linkExistingPaymentToJob(
    appointmentId: string,
    jobId: string,
  ): Promise<void> {
    const payment = await this.paymentsDao.findOne({
      where: { appointment_id: appointmentId, is_deleted: false },
    });
    if (!payment || payment.job_id) return;

    await this.paymentsDao.update(payment.id, { job_id: jobId });
    this.logger.log(
      `Linked existing payment ${payment.payment_id} to job ${jobId}`,
      JobService.context,
    );
  }

  /**
   * Resolve invoice pricing for a job from the Charges master, keyed by
   * (centre, vehicle_type, charge_category). Returns `charge_missing: true` with
   * zeroed amounts when no matching charge exists (the FE blocks + warns).
   * Advance currently 0 (wired to the payment API in a later milestone).
   */
  async resolvePricing(id: string): Promise<JobPricingResult> {
    const job = await this.findOne(id);
    return this.resolvePricingForJob(job);
  }

  /**
   * Maps a job onto a Charges-master row, or clears the mapping with null.
   *
   * The case this exists for: a Sedan arrives at a centre whose master prices
   * only SUV, so the job cannot be priced at all. The operator maps it to the
   * comparable configured type and the job is priced from that.
   *
   * Allowed even when the job already has a payment, deliberately. An online
   * booking is paid at the provider before the vehicle ever arrives, so a
   * payment exists from the moment the appointment converts — refusing to map
   * afterwards would block the mapping on every online job, which is the main
   * case it exists for. What an existing payment IS, is an advance: pricing
   * subtracts it, so re-mapping re-prices the job and shows what is still
   * payable rather than double-charging.
   */
  async setCharge(id: string, chargeId: string | null): Promise<Job> {
    const job = await this.findOne(id);

    const existingPayment = await this.paymentsDao.findByJobId(job.id);
    if (existingPayment) {
      // Not refused, but worth a line: the job was re-priced after money had
      // already been taken against it, and the two need to reconcile.
      this.logger.log(
        `Job ${job.id} is being re-priced although payment #${existingPayment.payment_id} (${existingPayment.grand_total}) already exists — it counts as an advance against the new amount`,
        JobService.context,
      );
    }

    if (chargeId) {
      const charge = await this.chargeDao.findActiveById(chargeId);
      if (!charge) {
        throw new BadRequestException(
          'That charge no longer exists in the Charges master.',
        );
      }

      // A charge belongs to a centre, and pricing a job from another centre's
      // master would quietly bill the customer at the wrong branch's rates.
      // A centre-less charge is a global default and is allowed anywhere.
      if (
        charge.centre_id &&
        job.centre_id &&
        charge.centre_id !== job.centre_id
      ) {
        throw new BadRequestException(
          'That charge belongs to a different centre and cannot be used to price this job.',
        );
      }

      await this.jobDao.update(job.id, { charge_id: charge.id });
      this.logger.log(
        `Job ${job.id} mapped to charge ${charge.id} (${charge.vehicle_type}) — vehicle type is ${job.vehicleRecord?.vehicle_type ?? 'unset'}`,
        JobService.context,
      );
    } else {
      await this.jobDao.update(job.id, { charge_id: null });
      this.logger.log(
        `Job ${job.id} charge mapping cleared — pricing falls back to the vehicle type`,
        JobService.context,
      );
    }

    return this.findOne(id);
  }

  /**
   * Resolve the payment for a job from the configured charges, filtered by the
   * job's vehicle type (lowercased). Uses the (centre, vehicle_type, category)
   * combo when a charge category is known, otherwise falls back to matching by
   * vehicle type alone. Returned inline on job create / get responses.
   */
  async resolvePricingForJob(job: Job): Promise<JobPricingResult> {
    const rawVehicleType =
      job.vehicleRecord?.vehicle_type ??
      job.vehicleRecord?.vehicleMaster?.vehicle_type ??
      null;
    const vehicleType = rawVehicleType
      ? rawVehicleType.trim().toLowerCase()
      : null;
    const chargeCategoryId =
      job.vehicleRecord?.vehicleMaster?.charge_category_id ?? null;

    const nextPaymentId = await this.paymentsDao.getNextPaymentsId();

    let charge: Charge | null = null;

    // An operator mapping wins over the vehicle's own type. A Sedan at a centre
    // that only prices SUV is priced as the SUV the operator mapped it to —
    // that decision is the whole point of the mapping, so it must not be
    // second-guessed by re-running the type lookup underneath it.
    if (job.charge_id) {
      charge = await this.chargeDao.findActiveById(job.charge_id);
      if (!charge) {
        this.logger.warn(
          `Job ${job.id} is mapped to charge ${job.charge_id}, which no longer exists — falling back to the vehicle type`,
          JobService.context,
        );
      }
    }

    if (!charge && vehicleType) {
      charge = chargeCategoryId
        ? await this.chargeDao.findByCombo(
            job.centre_id ?? undefined,
            vehicleType,
            chargeCategoryId,
          )
        : null;
      // Fallback: match by vehicle type alone (e.g. walk-ins with no category).
      charge ??= await this.chargeDao.findByVehicleType(
        job.centre_id ?? undefined,
        vehicleType,
      );
    }

    if (!charge) {
      return {
        charge_missing: true,
        vehicle_type: vehicleType,
        charge_category_id: chargeCategoryId,
        center_charges: 0,
        rop_charges: 0,
        vat_percent: 0,
        grand_total: 0,
        advance: 0,
        payable: 0,
        next_payment_id: nextPaymentId,
      };
    }

    const grandTotal = Number(charge.grand_total);
    // Advance already collected (from the third-party payment API; 0 until wired).
    const plate = job.vehicleRecord?.plate_number;
    const paymentInfo = plate
      ? await this.paymentApi.fetchByPlate(plate)
      : null;

    // Money already taken against THIS job counts as an advance too.
    //
    // An online booking is settled at the provider before the vehicle arrives,
    // so by the time the job is priced the customer has already paid. Ignoring
    // that made `payable` the full charge again — asking them to pay twice, and
    // it is precisely what the operator sees after re-mapping a vehicle type on
    // a job that already carries a provider payment.
    const settled = await this.paymentsDao.findSettledByJobId(job.id);
    const collected = settled.reduce(
      (sum, payment) => sum + Number(payment.grand_total ?? 0),
      0,
    );

    const advance = (paymentInfo?.advance ?? 0) + collected;
    const mapped = Boolean(job.charge_id) && charge.id === job.charge_id;
    return {
      charge_missing: false,
      // The type the price actually came from. On a mapped job that is the
      // operator's chosen type, not the vehicle's own — reporting the vehicle's
      // would show a price next to a type that did not produce it.
      vehicle_type: mapped ? charge.vehicle_type : vehicleType,
      charge_category_id: mapped
        ? (charge.charge_category_id ?? null)
        : chargeCategoryId,
      charge_id: charge.id,
      /** True when this price came from an operator mapping, not the vehicle's type. */
      mapped_from_vehicle_type: mapped ? vehicleType : null,
      center_charges: Number(charge.center_charges),
      rop_charges: Number(charge.rop_charges),
      vat_percent: Number(charge.vat_percent),
      grand_total: grandTotal,
      advance,
      payable: Math.max(0, grandTotal - advance),
      next_payment_id: nextPaymentId,
    };
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<Job>> {
    this.logger.log(
      `Fetching jobs — page: ${query.page}, limit: ${query.limit}`,
      JobService.context,
    );

    try {
      return await this.jobDao.findPaginated(query);
    } catch (error) {
      this.logger.error(
        `Failed to fetch jobs: ${(error as Error).message}`,
        (error as Error).stack,
        JobService.context,
      );
      throw new DatabaseException('Failed to fetch jobs. Please try again.');
    }
  }

  async findOne(id: string): Promise<Job> {
    this.logger.log(`Fetching job ID: ${id}`, JobService.context);

    try {
      const job = await this.jobDao.findActiveById(id);
      if (!job) {
        throw new ResourceNotFoundException('Job', id);
      }
      job.images = await this.jobImageDao.findByJobId(id);
      return job;
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to fetch job: ${(error as Error).message}`,
        (error as Error).stack,
        JobService.context,
      );
      throw new DatabaseException('Failed to fetch job. Please try again.');
    }
  }

  /** Raw IN file contents for the Test & Submit preview modal. */
  async getInFileContent(id: string): Promise<string> {
    const job = await this.findOne(id);

    if (!job.infile_path) {
      throw new BadRequestException(
        'IN file has not been generated yet — start the job first.',
      );
    }

    try {
      return await fs.readFile(job.infile_path, 'utf8');
    } catch (error) {
      this.logger.error(
        `Failed to read IN file at ${job.infile_path}: ${(error as Error).message}`,
        (error as Error).stack,
        JobService.context,
      );
      throw new BadRequestException(
        'IN file could not be read from disk — it may have been moved or the share is unavailable.',
      );
    }
  }

  /**
   * Raw OUT file contents for the Test & Submit preview modal.
   *
   * Reads from disk rather than replaying the parsed results so the operator
   * sees exactly what the rig wrote — the parsed view is already on the page,
   * and a parse that silently dropped a section is only visible in the raw text.
   */
  async getOutFileContent(id: string): Promise<string> {
    const job = await this.findOne(id);

    if (!job.outfile_path) {
      throw new BadRequestException(
        'OUT file has not been received yet — the lane has not written a result for this job.',
      );
    }

    try {
      return await fs.readFile(job.outfile_path, 'utf8');
    } catch (error) {
      this.logger.error(
        `Failed to read OUT file at ${job.outfile_path}: ${(error as Error).message}`,
        (error as Error).stack,
        JobService.context,
      );
      throw new BadRequestException(
        'OUT file could not be read from disk — it may have been moved or the share is unavailable.',
      );
    }
  }

  async update(id: string, updateDto: UpdateJobDto): Promise<Job> {
    this.logger.log(`Updating job ID: ${id}`, JobService.context);

    try {
      const job = await this.findOne(id);
      await this.validateJobReferences(updateDto);

      const merged = this.jobDao.merge(job, {
        ...updateDto,
        ...(updateDto.started_at
          ? { started_at: new Date(updateDto.started_at) }
          : {}),
        ...(updateDto.completed_at
          ? { completed_at: new Date(updateDto.completed_at) }
          : {}),
        ...(updateDto.invoice_date
          ? { invoice_date: new Date(updateDto.invoice_date) }
          : {}),
      });

      const auditDetails = this.buildJobAuditDetailsFromEntity(job);
      Object.assign(merged, auditDetails);
      patchAuditContext({
        jobAuditDetails: { ...auditDetails },
        jobAuditDetailsBefore: { ...auditDetails },
      });

      try {
        const saved = await this.jobDao.save(merged);
        this.logger.log(`Job updated ID: ${saved.id}`, JobService.context);
        return (await this.jobDao.findActiveById(saved.id)) ?? saved;
      } finally {
        patchAuditContext({
          jobAuditDetails: null,
          jobAuditDetailsBefore: null,
        });
      }
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to update job: ${(error as Error).message}`,
        (error as Error).stack,
        JobService.context,
      );
      throw new DatabaseException('Failed to update job. Please try again.');
    }
  }

  async remove(id: string): Promise<void> {
    this.logger.log(`Deleting job ID: ${id}`, JobService.context);

    try {
      const job = await this.findOne(id);
      const auditDetails = this.buildJobAuditDetailsFromEntity(job);
      Object.assign(job, auditDetails);
      job.is_deleted = true;
      patchAuditContext({ jobAuditDetails: { ...auditDetails } });
      try {
        await this.jobDao.save(job);
        this.logger.log(`Job soft-deleted ID: ${id}`, JobService.context);
      } finally {
        patchAuditContext({
          jobAuditDetails: null,
          jobAuditDetailsBefore: null,
        });
      }
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to delete job: ${(error as Error).message}`,
        (error as Error).stack,
        JobService.context,
      );
      throw new DatabaseException('Failed to delete job. Please try again.');
    }
  }

  private async resolveJobAuditDetails(input: {
    customer_id?: string | null;
    vehicle_record_id?: string | null;
    appointment_id?: string | null;
  }): Promise<JobAuditDetails> {
    const [customer, vehicle, appointment] = await Promise.all([
      input.customer_id
        ? this.customerDao.findActiveById(input.customer_id)
        : Promise.resolve(null),
      input.vehicle_record_id
        ? this.vehicleRecordDao.findActiveById(input.vehicle_record_id)
        : Promise.resolve(null),
      input.appointment_id
        ? this.appointmentDao.findActiveById(input.appointment_id)
        : Promise.resolve(null),
    ]);

    return {
      plate_number: vehicle?.plate_number ?? null,
      customer_name: customer?.owner_name ?? null,
      booking_type: appointment?.booking_type ?? 'Walk-in',
    };
  }

  private buildJobAuditDetailsFromEntity(job: Job): JobAuditDetails {
    return {
      plate_number: job.vehicleRecord?.plate_number ?? null,
      customer_name: job.customer?.owner_name ?? null,
      booking_type: job.appointment?.booking_type ?? 'Walk-in',
    };
  }

  private async validateJobReferences(
    dto: Partial<
      Pick<
        CreateJobDto,
        | 'customer_id'
        | 'vehicle_record_id'
        | 'anpr_capture_id'
        | 'centre_id'
        | 'line_id'
        | 'admin_pc_id'
        | 'camera_id'
      >
    >,
  ): Promise<void> {
    if (dto.customer_id) {
      const customer = await this.customerDao.findActiveById(dto.customer_id);
      if (!customer) {
        throw new ResourceNotFoundException('Customer', dto.customer_id);
      }
    }

    if (dto.vehicle_record_id) {
      const vehicleRecord = await this.vehicleRecordDao.findActiveById(
        dto.vehicle_record_id,
      );
      if (!vehicleRecord) {
        throw new ResourceNotFoundException(
          'VehicleRecord',
          dto.vehicle_record_id,
        );
      }
    }

    if (dto.anpr_capture_id) {
      const anprCapture = await this.anprCaptureDao.findActiveById(
        dto.anpr_capture_id,
      );
      if (!anprCapture) {
        throw new ResourceNotFoundException('AnprCapture', dto.anpr_capture_id);
      }
    }

    if (dto.centre_id) {
      const centre = await this.centreDao.findActiveById(dto.centre_id);
      if (!centre) {
        throw new ResourceNotFoundException('Centre', dto.centre_id);
      }
    }

    if (dto.line_id) {
      const line = await this.lineDao.findActiveById(dto.line_id);
      if (!line) {
        throw new ResourceNotFoundException('Line', dto.line_id);
      }
    }

    if (dto.admin_pc_id) {
      const adminPc = await this.adminPcDao.findActiveById(dto.admin_pc_id);
      if (!adminPc) {
        throw new ResourceNotFoundException('AdminPc', dto.admin_pc_id);
      }
    }

    if (dto.camera_id) {
      const camera = await this.cameraDao.findActiveById(dto.camera_id);
      if (!camera) {
        throw new ResourceNotFoundException('Camera', dto.camera_id);
      }
    }
  }
}
