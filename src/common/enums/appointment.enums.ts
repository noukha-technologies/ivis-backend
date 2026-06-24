export const APPOINTMENT_STATUSES = ['Queued', 'Scheduled', 'Confirmed', 'Cancelled', 'Completed'] as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const APPOINTMENT_PAYMENT_MODES = ['Cash', 'UPI', 'Card', 'Bank Transfer'] as const;

export type AppointmentPaymentMode = (typeof APPOINTMENT_PAYMENT_MODES)[number];

export const APPOINTMENT_TYPES = ['Paid', 'Unpaid'] as const;

export type AppointmentType = (typeof APPOINTMENT_TYPES)[number];
