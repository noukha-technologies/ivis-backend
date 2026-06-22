export interface ICentreMasterFields {
    id: string;
    centre_id: number;
    name: string;
    code: string;
    description?: string;
    status: string;
    created_by?: string;
    created_at: Date;
    updated_at: Date;
    is_deleted: boolean;
}

export interface ILineMasterFields {
    id: string;
    line_id: number;
    name: string;
    code: string;
    centre_id: string;
    display_order: number;
    description?: string;
    status: string;
    created_by?: string;
    created_at: Date;
    updated_at: Date;
    is_deleted: boolean;
}

export interface IVehicleMasterFields {
    id: string;
    vehicle_id: number;
    name: string;
    code: string;
    vin_no?: string;
    status: string;
    description?: string;
    created_by?: string;
    created_at: Date;
    updated_at: Date;
    is_deleted: boolean;
}

export interface IAdminPcMasterFields {
    id: string;
    admin_pc_id: number;
    name: string;
    code: string;
    ip_address: string;
    description?: string;
    status: string;
    created_by?: string;
    created_at: Date;
    updated_at: Date;
    is_deleted: boolean;
}

export interface IPaymentMasterFields {
    id: string;
    payment_id: number;
    customer_id?: string | null;
    code: string;
    status: string;
    payment_mode?: string | null;
    type?: string | null;
    amount: number;
    created_by?: string;
    created_at: Date;
    updated_at: Date;
    is_deleted: boolean;
}

export interface IChargeMasterFields {
    id: string;
    charge_id: number;
    centre_id?: string;
    vehicle_id: string;
    category: string;
    center_charges: number;
    rop_charges: number;
    vat_percent: number;
    grand_total: number;
    validate_to: Date;
    status: string;
    is_enabled: boolean;
    created_by?: string;
    created_at: Date;
    updated_at: Date;
    is_deleted: boolean;
}

export interface ICameraMasterFields {
    id: string;
    camera_name: string;
    ip_address: string;
    port: number;
    username?: string;
    password?: string;
    integration_method?: string;
    ftp_directory?: string;
    is_online: boolean;
    line_id: string;
    last_event_at?: Date;
    last_health_check?: Date;
    description?: string;
    status: string;
    created_by?: string;
    created_at: Date;
    updated_at: Date;
    deleted_at?: Date;
}


export interface IPaymentTypeMasterFields {
    id: string;
    payment_type_id: number;
    name: string;
    code: string;
    status: string;
    created_by?: string;
    created_at: Date;
    updated_at: Date;
    is_deleted: boolean;
}