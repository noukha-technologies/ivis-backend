export interface IPaymentsFields {
  id: string;
  payments_id: number;
  appointment_id?: string | null;
  customer_id: string;
  vehicle_record_id: string;
  job_id?: string | null;
  anpr_capture_id?: string | null;
  centre_id?: string | null;
  line_id?: string | null;
  admin_pc_id?: string | null;
  camera_id?: string | null;
  payment_type: string;
  payment_mode?: string | null;
  status: string;
  charges: number;
  vat: number;
  grand_total: number;
  pay_date?: Date | null;
  capture_image_path?: string | null;
  attachment_path?: string | null;
  attachment_filename?: string | null;
  created_by?: string | null;
  created_at: Date;
  updated_at: Date;
  is_deleted: boolean;
}


export interface IAnprCaptureFields {
  id: string;
  anpr_capture_id: number;
  plate_number: string;
  normalized_plate?: string | null;
  plate_confidence?: number | null;
  capture_time: Date;
  camera_id: string;
  line_id?: string | null;
  direction?: string | null;
  plate_color?: string | null;
  vehicle_type?: string | null;
  vehicle_color?: string | null;
  image_url?: string | null;
  raw_payload?: Record<string, unknown> | null;
  created_by?: string | null;
  created_at: Date;
  updated_at: Date;
  is_deleted: boolean;
}