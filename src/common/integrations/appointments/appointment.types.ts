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
