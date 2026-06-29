/**
 * Job lifecycle statuses (stored as varchar), per the Opal scope:
 * Pending → In Progress → Completed → Submitted → Closed.
 * Pass/Fail/Redo is NOT a status — it lives in `overall_result` (JOB_OVERALL_RESULTS).
 */
export const JOB_STATUSES = [
  'Pending',
  'In Progress',
  'Completed',
  'Submitted',
  'Closed',
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

/** How the job was created */
export const JOB_SOURCES = ['Booked', 'Walk-In', 'ANPR'] as const;

export type JobSource = (typeof JOB_SOURCES)[number];

/** Set when OUT file is processed (test outcome — separate from lifecycle status) */
export const JOB_OVERALL_RESULTS = ['Passed', 'Failed', 'Redo'] as const;

export type JobOverallResult = (typeof JOB_OVERALL_RESULTS)[number];

/** Payment type on job intake form */
export const JOB_PAYMENT_TYPES = ['Paid', 'FOC'] as const;

export type JobPaymentType = (typeof JOB_PAYMENT_TYPES)[number];
