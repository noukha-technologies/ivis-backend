export interface UserResponseInterface {
    id: string;
    user_code: string;
    user_name: string;
    email: string;
    role_id: string;
    roleName: string;
    center_id?: string;
    line_ids?: string[];
    created_at: string;
    updated_at: string;
    deleted_at?: string;
}