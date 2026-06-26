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