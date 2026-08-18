import { isProduction } from '../../config/env.config';

/**
 * Shared constants for the appointment provider (Tajdeed VIS) integration.
 *
 * Kept separate from the clients so the E-code classification is testable on
 * its own and cannot drift between the pull and push paths.
 */

/**
 * Default base URL when APPOINTMENT_API_BASE_URL is unset. Deliberately the
 * STAGING host: an unconfigured environment must fail safe toward the SBX test
 * branch, never toward the live production queues.
 */
export const APPOINTMENT_DEFAULT_BASE_URL =
  'https://staging.tajdeed.com.om/api/v1/vis';

export const APPOINTMENT_BRANCHES_PATH = '/branches';
export const APPOINTMENT_EVENTS_PATH = '/events';

/** Provider success code. Every response carries `status`; E0000 means success. */
export const APPOINTMENT_SUCCESS_CODE = 'E0000';

/**
 * Duplicate transaction_id. A SAFE outcome, not a failure: it means the event
 * already reached the provider, so the push should settle rather than retry.
 * It says nothing about whether processing succeeded.
 */
export const APPOINTMENT_DUPLICATE_CODE = 'E0007';

/**
 * Caps how long any provider call may hang. Without it a stalled connection
 * blocks the caller forever — on the ingest poller that would wedge the whole
 * cycle, and on the outbox drain it would hold the claim past its backoff.
 */
export const REQUEST_TIMEOUT_MS = 15_000;

/** The provider refuses more than 100 transaction ids per reconcile call. */
export const RECONCILE_BATCH_LIMIT = 100;

/**
 * Retry backoff for a pushed event, in seconds — the provider's published
 * schedule (immediate, 10s, 30s, 60s, then every 5 minutes). The last entry
 * repeats for all further attempts rather than escalating, so a long provider
 * outage settles into a steady 5-minute poll instead of backing off forever.
 */
export const PUSH_RETRY_BACKOFF_SECONDS = [0, 10, 30, 60, 300];

export function nextRetryDelayMs(attemptCount: number): number {
  const index = Math.min(attemptCount, PUSH_RETRY_BACKOFF_SECONDS.length - 1);
  return PUSH_RETRY_BACKOFF_SECONDS[index] * 1000;
}

/** Resolved base URL with any trailing slash removed. */
export function appointmentBaseUrl(): string {
  return (
    process.env.APPOINTMENT_API_BASE_URL?.trim() || APPOINTMENT_DEFAULT_BASE_URL
  ).replace(/\/$/, '');
}

/**
 * The single global API key, valid for every active branch.
 *
 * Deliberately environment-level rather than per centre: a branch-scoped key
 * would have to be requested from the provider for each new centre, making
 * centre setup depend on an external party. The trade-off is blast radius —
 * one key serves every branch — so it lives only on the server and is never
 * returned to a client.
 *
 * Because a global key does not identify a branch on its own, every
 * branch-scoped request MUST carry branch_code; omitting it is E0003.
 */
export function appointmentApiKey(): string | null {
  return process.env.APPOINTMENT_API_KEY?.trim() || null;
}

export function isAppointmentApiConfigured(): boolean {
  return appointmentApiKey() !== null;
}

/**
 * Branches that accept WRITES (inspection results, lane status) outside
 * production.
 *
 * This is the provider's own guidance, not an IVIS policy: MSC, SEB and SHR
 * are live queues even on the staging host, so a push from a dev box would
 * inject fake results into a real branch's work. SBX is the isolated
 * integration branch and is the only safe write target outside production.
 *
 * Reading and linking are unrestricted — this guard applies only to pushes.
 */
const WRITABLE_NON_PRODUCTION_BRANCHES = ['SBX'];

export function writableNonProductionBranches(): string[] {
  return [...WRITABLE_NON_PRODUCTION_BRANCHES];
}

export function isBranchWritable(branchCode: string): boolean {
  if (isProduction()) return true;
  return WRITABLE_NON_PRODUCTION_BRANCHES.includes(
    branchCode.trim().toUpperCase(),
  );
}
