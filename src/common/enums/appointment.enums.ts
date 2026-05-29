export const APPOINTMENT_STATUSES = ['Scheduled', 'Confirmed', 'Cancelled', 'Completed'] as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];
