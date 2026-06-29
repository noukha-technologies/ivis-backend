export const VEHICLE_MASTER_STATUSES = ['Active', 'Inactive', 'Suspended'] as const;

export type VehicleMasterStatus = (typeof VEHICLE_MASTER_STATUSES)[number];

/** Vehicle body type — fixed dropdown list for the Vehicle Master. */
export const VEHICLE_TYPES = [
  'Sedan',
  'SUV',
  'Hatchback',
  'Van',
  'Pickup',
  'Truck',
  'Bus',
  'Tractor',
  'Two-Wheeler',
] as const;

export type VehicleType = (typeof VEHICLE_TYPES)[number];
