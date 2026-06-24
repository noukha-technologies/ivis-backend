/** Job lifecycle statuses (stored as varchar). UI: Created → Test & Submit */
export const JOB_STATUSES = [
  'Queued',
  'Pending',
  'Ready',
  'InProgress',
  'Passed',
  'Failed',
  'Cancelled',
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

/** How the job was created */
export const JOB_SOURCES = ['Booked', 'Walk-In', 'ANPR'] as const;

export type JobSource = (typeof JOB_SOURCES)[number];

/** Set when OUT file is processed */
export const JOB_OVERALL_RESULTS = ['Passed', 'Failed'] as const;

export type JobOverallResult = (typeof JOB_OVERALL_RESULTS)[number];

/** Payment type on job intake form */
export const JOB_PAYMENT_TYPES = ['Paid', 'FOC'] as const;

export type JobPaymentType = (typeof JOB_PAYMENT_TYPES)[number];
