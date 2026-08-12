import { isProduction } from '../../config/env.config';

/**
 * Shared constants for the appointment provider (Tajdeed VIS) integration.
 *
 * Kept separate from the clients so the E-code classification is testable on
 * its own and cannot drift between the pull and push paths.
 */

/**
 * Default base URL when APPOINTMENT_API_BASE_URL is unset. Deliberately the
 * STAGING host: an unconfigured environment must fail safe toward the sandbox
 * branch, never toward the live production queues.
 */
export const APPOINTMENT_DEFAULT_BASE_URL =
  'https://staging.tajdeed.com.om/api/v1/vis';

export const APPOINTMENT_BRANCHES_PATH = '/branches';
export const APPOINTMENT_EVENTS_PATH = '/events';

/** Provider success code. Every response carries `status`; E0000 means success. */
export const APPOINTMENT_SUCCESS_CODE = 'E0000';

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
