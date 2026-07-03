export const whiteListingDomains = ["http://localhost:3000"]

export interface ErrorDetails {
    code: string;
    statusCode: number;
    message: string;
}

export interface FtpProcessResult {
    filesFound: number;
    parsed: number;
    saved: number;
};

export interface FtpCursor {
    dateFolder: string;
    timestampKey: string;
};

/** Per-centre system configuration (one row per centre). */
export interface IConfigurationFields {
    id: string;
    configuration_id: number;
    centre_id: string;
    /** 'Manual' → show the Sync button; 'Automatic' → hide and sync continuously. */
    sync_mode: string;
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