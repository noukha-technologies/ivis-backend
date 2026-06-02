export const VEHICLE_MASTER_STATUSES = ['Active', 'Inactive', 'Suspended'] as const;

export type VehicleMasterStatus = (typeof VEHICLE_MASTER_STATUSES)[number];
