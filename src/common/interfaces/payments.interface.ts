import { PaymentStatusEnum } from "../enums/payment.enums";
import { AnprCaptureStatus } from "../enums/camera.enums";

export interface IPaymentsFields {
  id: string;
  payment_id: number;
  appointment_id?: string | null;
  customer_id: string;
  vehicle_record_id: string;
  job_id?: string | null;
  anpr_capture_id?: string | null;
  centre_id?: string | null;
  line_id?: string | null;
  camera_id?: string | null;
  payment_type_id?: string | null;
  status: PaymentStatusEnum;
  grand_total: number;
  pay_date?: Date | null;
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
  status: AnprCaptureStatus;
  created_by?: string | null;
  created_at: Date;
  updated_at: Date;
  is_deleted: boolean;
}