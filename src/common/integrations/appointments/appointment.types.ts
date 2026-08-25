/**
 * Wire shapes returned by the appointment provider (Tajdeed VIS API).
 *
 * These are external-response contracts, not user input — no class-validator
 * decorators. Request DTOs live in common/dto/appointment-branch.dto.ts.
 */

/** A lane at a branch, as returned by GET /branches. */
export interface AppointmentLane {
  lane_id: string;
  name: string;
}

/**
 * A branch in the provider's directory. Branches map 1:1 to IVIS centres and
 * lanes to IVIS lines, but the identifiers are the provider's, not ours — see
 * Centre.provider_branch_code.
 */
export interface AppointmentBranch {
  branch_code: string;
  name: string;
  timezone: string;
  lanes: AppointmentLane[];
}

export interface AppointmentVehicle {
  plate_number: string;
  plate_type: string;
  category: string;
  vin: string | null;
  chassis_number: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  color: string | null;
}

export interface AppointmentCustomer {
  name: string;
  phone: string;
  email: string;
}

export type AppointmentBookingStatus =
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'IN_PROGRESS'
  | 'COMPLETED';

/** One booking, identical in shape everywhere the provider returns one. */
export interface AppointmentBooking {
  booking_id: string;
  status: AppointmentBookingStatus;
  appointment_date: string;
  appointment_time: string;
  checked_in_at: string | null;
  assigned_lane: string | null;
  is_reinspection: boolean;
  payment_status: 'PAID' | 'FREE';
  fee_amount: string;
  currency: string;
  payment_method: string | null;
  payment_reference: string | null;
  vehicle: AppointmentVehicle;
  customer: AppointmentCustomer;
}

/** Every response carries a provider status code; E0000 means success. */
export interface AppointmentEnvelope {
  status?: string;
  message?: string;
  transaction_id?: string | null;
  timestamp?: string;
}

export interface BranchListResponse extends AppointmentEnvelope {
  branches?: AppointmentBranch[];
  total?: number;
}

export interface BookingListResponse extends AppointmentEnvelope {
  branch_code?: string;
  date?: string;
  appointments?: AppointmentBooking[];
  total?: number;
}

export interface SingleBookingResponse extends AppointmentEnvelope {
  appointment?: AppointmentBooking;
}

/**
 * One entry in the branch picker shown during centre setup. Unavailable
 * branches are returned annotated rather than filtered out, so the operator
 * sees why a branch cannot be chosen instead of wondering where it went.
 */
export interface BranchOption {
  branch_code: string;
  name: string;
  timezone: string;
  lane_count: number;
  taken_by_centre_code: string | null;
  selectable: boolean;
  unavailable_reason: string | null;
}

/** How one line maps onto a provider lane, as resolved during verify/link. */
export interface LaneMappingPreview {
  lane_id: string;
  lane_name: string;
  line_id: string | null;
  line_code: string | null;
  matched: boolean;
}

export interface BranchVerificationResult {
  branch_code: string;
  name: string;
  timezone: string;
  lanes: AppointmentLane[];
  lane_mappings: LaneMappingPreview[];
  unmatched_lines: { line_id: string; line_code: string }[];
}

export interface BranchStatusResult {
  centre_id: string;
  centre_code: string;
  linked: boolean;
  provider_branch_code: string | null;
  drift: string[];
}

/* ------------------------------------------------------------------ *
 * Outbound — what WE send to the provider (POST /events).
 *
 * Unlike the response shapes above, these are construct-side: fields are
 * required unless the provider genuinely treats them as optional, so a
 * malformed event fails to compile rather than being rejected as E0003.
 * ------------------------------------------------------------------ */

/** One measured test block. Every field is optional per the provider. */
export interface ExhaustResult {
  co_value?: number;
  hc_value?: number;
  result?: string;
}

export interface SlideSlipResult {
  front_axle?: number;
  rear_axle?: number;
  result?: string;
}

export interface BrakeResult {
  axle1_sb_left?: number;
  axle1_sb_right?: number;
  axle2_sb_left?: number;
  axle2_sb_right?: number;
  axle1_pb_left?: number;
  axle1_pb_right?: number;
  axle2_pb_left?: number;
  axle2_pb_right?: number;
  sb_efficiency?: number;
  pb_efficiency?: number;
  vehicle_weight_kg?: number;
  result?: string;
}

/**
 * The inspection result payload. Only plate_number and overall_result are
 * required for it to process; plate_type is optional in the contract but
 * effectively mandatory, because without it a plate shared across two plate
 * types matches two vehicles and the event FAILS rather than guessing.
 */
export interface InspectionResultPayload {
  plate_number: string;
  overall_result: 'APPROVED' | 'REJECTED';
  plate_type?: string;
  inspection_number?: number;
  inspection_date?: string;
  start_time?: string;
  end_time?: string;
  station_id?: string;
  lane_id?: string;
  printed_by?: string;
  exhaust?: ExhaustResult;
  slide_slip?: SlideSlipResult;
  brake?: BrakeResult;
  exceptions?: string;
  comments?: string;
}

export type LaneOccupancyStatus = 'OCCUPIED' | 'IDLE' | 'OUT_OF_SERVICE';

/** One lane's state, used both standalone and inside a heartbeat. */
export interface LaneStatusEntry {
  lane_id: string;
  status: LaneOccupancyStatus;
  plate_number?: string;
  started_at?: string;
  cleared_at?: string;
}

/**
 * A single lane change carries the lane fields at the top level; a heartbeat
 * carries `heartbeat: true` and a full `lanes` snapshot that OVERWRITES the
 * provider's state — which is what repairs any single change that was lost.
 */
export type LaneStatusPayload =
  | LaneStatusEntry
  | { heartbeat: true; lanes: LaneStatusEntry[] };

/** The envelope every pushed event shares. All five fields are mandatory. */
export interface TajdeedEventEnvelope {
  event_type: 'INSPECTION_RESULT' | 'LANE_STATUS';
  transaction_id: string;
  branch_code: string;
  timestamp: string;
  payload: InspectionResultPayload | LaneStatusPayload;
}

/** One entry from GET /events/:id/status or POST /reconcile. */
export interface EventStatusResult extends AppointmentEnvelope {
  event_status?: string;
  event_type?: string;
  received_at?: string;
  processed_at?: string;
  error_message?: string | null;
}

/**
 * One transaction's outcome inside a reconcile sweep. Entries that came back
 * NOT_FOUND carry only the id and the status — the provider omits the rest
 * rather than nulling it, so every other field is optional.
 */
export interface ReconcileEntry {
  transaction_id: string;
  event_status: string;
  event_type?: string;
  received_at?: string;
  processed_at?: string;
}

export interface ReconcileResponse extends AppointmentEnvelope {
  results?: ReconcileEntry[];
  total?: number;
}

/**
 * The outcome of one push attempt.
 *
 * Three-way rather than the read path's null-on-everything, because a push
 * must distinguish "delivered", "try again later" and "never retry this" —
 * collapsing them would either lose events or hammer the provider with a
 * request that can never succeed.
 */
export type PushOutcome = {
  /**
   * The provider's raw body, verbatim, whatever the outcome. Undefined only
   * when no body was received at all — a timeout, a connection failure, or a
   * response that was not JSON. Carried on the outcome rather than logged and
   * dropped, so the caller can persist the evidence alongside its own verdict.
   */
  response?: Record<string, unknown>;
} & (
  | { ok: true; duplicate: boolean }
  | { ok: false; retryable: true; reason: string }
  | { ok: false; retryable: false; code: string | null; reason: string }
);
