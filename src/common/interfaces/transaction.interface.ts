import type { AppointmentStatus } from '../enums/common.enums';

export interface ICustomerFields {
    id: string;
    customer_id: number;
    customer_name: string;
    phone: string;
    alternate_phone?: string;
    owner_name?: string;
    owner_phone_number?: string;
    id_number?: string;
    chassis_no?: string;
    mulkiya_id?: string;
    vehicle_record_id?: string | null;
    created_by?: string;
    created_at: Date;
}

/**
 * Appointment is a thin booking record: it stores only the foreign keys to the
 * customer / vehicle record / ANPR capture / centre / line plus the booking
 * metadata. All customer + vehicle details are read through those relations,
 * never duplicated on the row.
 */
export interface IAppointmentFields {
    id: string;
    appointment_id: number;
    anpr_capture_id?: string | null;
    customer_id?: string | null;
    vehicle_record_id?: string | null;
    centre_id?: string | null;
    line_id?: string | null;
    booking_type: string;
    appointment_at: Date;
    status: AppointmentStatus;
    notes?: string;
    created_by?: string;
    created_at: Date;
    updated_at: Date;
    is_deleted: boolean;
}
