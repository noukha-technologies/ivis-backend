/** Job lifecycle statuses (stored as varchar). UI: Created → Test & Submit */
export const JOB_STATUSES = [
  'Pending',
  'Ready',
  'InProgress',
  'Passed',
  'Failed',
  'Cancelled',
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

/** How the job was created */
export const JOB_SOURCES = ['Booked', 'Walk-In'] as const;

export type JobSource = (typeof JOB_SOURCES)[number];

/** Set when OUT file is processed */
export const JOB_OVERALL_RESULTS = ['Passed', 'Failed'] as const;

export type JobOverallResult = (typeof JOB_OVERALL_RESULTS)[number];
