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