export const PAYMENT_TRANSACTION_STATUSES = ['Pending', 'Paid', 'Cancelled'] as const;
export type PaymentTransactionStatus = (typeof PAYMENT_TRANSACTION_STATUSES)[number];

export const PAYMENT_TRANSACTION_TYPES = ['Paid', 'FOC'] as const;
export type PaymentTransactionType = (typeof PAYMENT_TRANSACTION_TYPES)[number];

export const PAYMENT_MODES = ['Cash', 'UPI', 'Card'] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];
