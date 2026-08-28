/**
 * Job lifecycle statuses (stored as varchar):
 * Pending → In Progress → Completed.
 * Pass/Fail/Redo is NOT a status — it lives in `overall_result` (JOB_OVERALL_RESULTS).
 */
export const JOB_STATUSES = ['Pending', 'In Progress', 'Completed'] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

/** How the job was created */
export const JOB_SOURCES = ['Booked', 'Walk-In', 'ANPR'] as const;

export type JobSource = (typeof JOB_SOURCES)[number];

/**
 * Whether this is the vehicle's first inspection or a return visit.
 *
 * A vehicle whose previous job reached Completed — which is the same moment its
 * result was pushed to ROP — is re-testing when it comes back. Independent of
 * whether that previous result passed or failed: the label describes the visit,
 * not the verdict.
 *
 * Stored rather than derived. It decides what the customer is charged and forms
 * part of an external filing, so it has to still read the same months later even
 * if the earlier job is corrected or removed.
 */
export const JOB_TYPES = ['Test', 'Re-test'] as const;

export type JobType = (typeof JOB_TYPES)[number];

/** Set when OUT file is processed (test outcome — separate from lifecycle status) */
export const JOB_OVERALL_RESULTS = ['Passed', 'Failed', 'Redo'] as const;

export type JobOverallResult = (typeof JOB_OVERALL_RESULTS)[number];

/** Payment type on job intake form */
export const JOB_PAYMENT_TYPES = ['Paid', 'FOC'] as const;

export type JobPaymentType = (typeof JOB_PAYMENT_TYPES)[number];
