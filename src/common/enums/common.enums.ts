export const enum USER_ROLES {
    ADMIN = 'admin',
    SYSTEM_ADMIN = 'system_admin',
    CLIENT_ADMIN = 'client_admin',
}

export const enum DATABASE_SCHEMAS {
    CORE = 'core',
    MASTER = 'master',
    TRANSACTION = 'transaction',
}

export const enum CameraIntegrationMethods {
    FTP = 'ftp',
    HTTP = 'http',
}

export const enum ChargeCategory {
    BELOW3T_LT1500CC = 'Below3T_Lt1500cc',
    BELOW3T_1500TO3000CC = 'Below3T_1500To3000cc',
    BELOW3T_3000TO4500CC = 'Below3T_3000To4500cc',
    BELOW3T_ABOVE4500CC = 'Below3T_Above4500cc',
    BELOW3T_TRACTOR = 'Below3T_Tractor',
    THREE_TO_5_TONES = '3To5Tones',
    ABOVE5_TONES = 'Above5Tones',
}

export type FullHealthCheckResult = {
    camera: {
        id: string;
        code: string;
        camera_name: string;
        ip_address: string;
    };
    healthStatus: string;
    lastCheck: Date | null;
    checks: {
        ping: {
            status: 'PASS' | 'FAIL';
            message: string;
        };
    };
};

export enum WebhookResolveReason {
    ALIAS = 'alias',
    CAMERA_CODE = 'camera_code',
    CENTRE_CODE = 'centre_code',
    REQUEST_IP = 'request_ip',
}

export enum ProcessedStrategy {
    MOVE = 'move',
    DELETE = 'delete',
    NONE = 'none'
}

export enum AppointmentStatus {
    QUEUED = 'Queued',
    SCHEDULED = 'Scheduled',
    CONFIRMED = 'Confirmed',
    CANCELLED = 'Cancelled',
    COMPLETED = 'Completed'
}

export enum RopVerificationStatus {
    PENDING = 'Pending',
    VALIDATED = 'Fetched',
    FAILED = 'Failed',
}

export enum AppointmentTypes {
    PAID = 'Paid',
    UNPAID = 'Unpaid'
}

// Booking kind — how the appointment originated. Distinct from AppointmentTypes
// (Paid/Unpaid). Walk-in = created manually at the centre; Online = ANPR-queued
// or external online-booking API.
export enum BookingType {
    WALK_IN = 'Walk-in',
    ONLINE = 'Online',
}