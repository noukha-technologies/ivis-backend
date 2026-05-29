export const PAYMENT_TRANSACTION_STATUSES = ['Pending', 'Paid', 'Cancelled'] as const;

export type PaymentTransactionStatus = (typeof PAYMENT_TRANSACTION_STATUSES)[number];
