/**
 * Onboarding Sync lifecycle for a centre server's local DB (stored as varchar):
 * PENDING → PENDING_CONFIRMATION → IN_PROGRESS → COMPLETED / FAILED.
 * COMPLETED is the "fully synced, never touch the central DB again" flag.
 */
export const ONBOARDING_STATUSES = [
  'PENDING',
  'PENDING_CONFIRMATION',
  'IN_PROGRESS',
  'COMPLETED',
  'FAILED',
] as const;

export type OnboardingStatusValue = (typeof ONBOARDING_STATUSES)[number];
