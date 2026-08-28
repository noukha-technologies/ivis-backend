import { Appointment } from 'src/modules/database/entity/appointment.entity';

export const whiteListingDomains = ['http://localhost:3000'];

export interface ErrorDetails {
  code: string;
  statusCode: number;
  message: string;
}

export interface FtpProcessResult {
  filesFound: number;
  parsed: number;
  saved: number;
}

export interface FtpCursor {
  dateFolder: string;
  timestampKey: string;
}

/** Per-centre system configuration (one row per centre). */
/**
 * Whether a plate may be registered at reception, and why not when it may not.
 *
 * A vehicle must have been seen by ANPR and verified against ROP before an
 * inspection can be booked for it — the result is filed to ROP under those
 * details, so booking on unverified ones is not allowed. `anpr_today` marks
 * the preferred case (the car is here now); an older capture for the same
 * vehicle still passes, as a secondary check.
 */
export interface PlateEligibility {
  plate: string;
  anpr_found: boolean;
  anpr_today: boolean;
  anpr_capture_id: string | null;
  anpr_capture_time: Date | null;
  rop_found: boolean;
  rop_status: string | null;
  rop_verified: boolean;
  eligible: boolean;
  reason: string | null;
  /** Set once ROP has answered, so the appointment can adopt the verification. */
  rop_verification_id: string | null;
  /**
   * What the camera and ROP already know about this vehicle.
   *
   * Read from records that exist — the capture, the ROP verification, the
   * vehicle record and any customer on file. Nothing here triggers a ROP call:
   * the operator is typing a plate, not asking us to go and look it up.
   *
   * Lets a walk-in raised AFTER the car arrived be filled from what the lane
   * already established, instead of retyping details ROP has stated.
   */
  known: PlateKnownDetails | null;
}

/** Vehicle and owner details already recorded for a plate. */
export interface PlateKnownDetails {
  owner_name: string | null;
  owner_phone: string | null;
  mulkiya_id: string | null;
  chassis_no: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_type: string | null;
  vehicle_color: string | null;
  plate_color: string | null;
  /** What the lane camera photographed, so the operator sees the actual car. */
  plate_image_url: string | null;
  scene_image_url: string | null;
  /**
   * The lane the camera read this vehicle on.
   *
   * The car is physically on that lane, so it answers the lane question better
   * than any mapping does — the camera is the proof of where the vehicle is.
   */
  line_id: string | null;
}

export interface IConfigurationFields {
  id: string;
  configuration_id: number;
  centre_id: string;
  /** 'Manual' → show the Sync Now button; 'Automatic' → push to central on the fixed twice-daily schedule. */
  sync_mode: string;
  redo_test_enabled: boolean;
  auto_close: boolean;
  /** Time-of-day (Oman) to auto-close jobs from available OUT files, 'HH:mm'. */
  auto_close_time?: string;
  /** Centre working hours (Oman), 'HH:mm'. */
  working_hours_start?: string;
  working_hours_end?: string;
  status: string;
  created_by?: string;
  created_at: Date;
  updated_at: Date;
  is_deleted: boolean;
}

export interface PlateLookupResult {
  plate_number: string;
  owner_name: string | null;
  owner_phone: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  mulkiya_id: string | null;
  id_number: string | null;
  plate_color: string | null;
  vehicle_color: string | null;
  vehicle_type: string | null;
  chassis_no: string | null;
  /** From the ROP record — the only source of make/model in the system. */
  vehicle_make: string | null;
  vehicle_model: string | null;
  charge_category_id: string | null;
}

export type AppointmentAuditDetails = {
  customer_name?: string | null;
  customer_phone?: string | null;
  owner_name?: string | null;
  driver_phone_number?: string | null;
  mulkiya_id?: string | null;
  plate_number?: string | null;
  plate_color?: string | null;
  vehicle_type?: string | null;
  charge_category_id?: string | null;
  chassis_no?: string | null;
};

export type AppointmentAuditEntity = Appointment &
  AppointmentAuditDetails & {
    __auditDetailBefore?: AppointmentAuditDetails;
  };

export interface OnlineAppointmentResult {
  plate_number: string;
  customer_name?: string;
  customer_phone?: string;
  id_number?: string;
  chassis_no?: string;
  vehicle_type?: string;
  appointment_at?: string;
}
