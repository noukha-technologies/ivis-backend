import { Job } from "src/modules/database/entity/job.entity";
import { Customer } from "src/modules/database/entity/customer.entity";
import { Payments } from "src/modules/database/entity/payments.entity";
import { VehicleRecord } from "src/modules/database/entity/vehicle-record.entity";

export interface JobIntakeResult {
    customer: Customer;
    vehicle_record: VehicleRecord;
    payments: Payments;
    job: Job | null;
}