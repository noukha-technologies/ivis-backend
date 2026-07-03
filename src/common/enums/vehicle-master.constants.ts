export const VEHICLE_MASTER_STATUSES = [
  'Active',
  'Inactive',
  'Suspended',
] as const;

export type VehicleMasterStatus = (typeof VEHICLE_MASTER_STATUSES)[number];

// Vehicle type is free text (sourced from ANPR / ROP / appointment), stored
// lowercase for charge comparison — no fixed list.
