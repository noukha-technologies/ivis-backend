import { Job } from 'src/modules/database/entity/job.entity';
import { Customer } from 'src/modules/database/entity/customer.entity';
import { Payments } from 'src/modules/database/entity/payments.entity';
import { VehicleRecord } from 'src/modules/database/entity/vehicle-record.entity';
import type { JobOverallResult, JobStatus } from '../enums/job.enums';

export interface JobIntakeResult {
  customer: Customer;
  vehicle_record: VehicleRecord;
  payments: Payments;
  job: Job | null;
}

export interface IJobFields {
  id: string;
  job_id: number;
  status: JobStatus;
  appointment_id?: string | null;
  customer_id: string;
  vehicle_record_id: string;
  anpr_capture_id?: string | null;
  centre_id?: string | null;
  line_id?: string | null;
  admin_pc_id?: string | null;
  camera_id?: string | null;
  invoice_no?: string;
  invoice_date?: Date;
  test_results?: Record<string, unknown> | null;
  overall_result?: JobOverallResult | null;
  infile_name?: string;
  infile_path?: string;
  outfile_name?: string;
  outfile_path?: string;
  started_at?: Date;
  completed_at?: Date;
  created_by?: string;
  created_at: Date;
  updated_at: Date;
  is_deleted: boolean;
}
