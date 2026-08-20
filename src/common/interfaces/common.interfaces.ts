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
export interface IConfigurationFields {
  id: string;
  configuration_id: number;
  centre_id: string;
  /** 'Manual' → show the Sync Now button; 'Automatic' → run on the twice-daily schedule below. */
  sync_mode: string;
  /** Automatic-mode Database Sync clock times (Oman time, 'HH:mm'). */
  sync_time_morning?: string;
  sync_time_evening?: string;
  redo_test_enabled: boolean;
  auto_close: boolean;
  /** Time-of-day (Oman) to auto-close jobs from available OUT files, 'HH:mm'. */
  auto_close_time?: string;
  payment_mandatory: boolean;
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
