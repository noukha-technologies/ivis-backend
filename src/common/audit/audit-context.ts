import { AsyncLocalStorage } from 'async_hooks';

export type AuditRequestContext = {
  userId?: string;
  userName?: string;
  ipAddress?: string;
  userAgent?: string;
  /** Set by services when a password field actually changes. */
  passwordChanged?: boolean;
  /**
   * Denormalized Appointment walk-in fields (customer, plate, category, …)
   * merged into the CREATE/UPDATE/DELETE audit snapshot.
   */
  appointmentAuditDetails?: Record<string, unknown> | null;
  /** Prior walk-in field snapshot for accurate UPDATE diffs. */
  appointmentAuditDetailsBefore?: Record<string, unknown> | null;
  /** Denormalized Job Management fields (customer, plate, booking type, …). */
  jobAuditDetails?: Record<string, unknown> | null;
  jobAuditDetailsBefore?: Record<string, unknown> | null;
  /** Denormalized Payments fields (customer, plate, mode, …). */
  paymentsAuditDetails?: Record<string, unknown> | null;
  paymentsAuditDetailsBefore?: Record<string, unknown> | null;
  /** Denormalized User fields (center name, role name, …). */
  userAuditDetails?: Record<string, unknown> | null;
  userAuditDetailsBefore?: Record<string, unknown> | null;
  /** Denormalized Role fields (role type, centres, permission profile, …). */
  roleAuditDetails?: Record<string, unknown> | null;
  roleAuditDetailsBefore?: Record<string, unknown> | null;
  /** Denormalized ANPR capture fields (camera/line names, …). */
  anprCaptureAuditDetails?: Record<string, unknown> | null;
  anprCaptureAuditDetailsBefore?: Record<string, unknown> | null;
  /** Skip audit for image upload / ROP pipeline saves on AnprCapture. */
  suppressAnprCaptureAudit?: boolean;
  /** Denormalized ROP verification fields (plate number, …). */
  ropVerificationAuditDetails?: Record<string, unknown> | null;
  ropVerificationAuditDetailsBefore?: Record<string, unknown> | null;
};

export const auditContextStorage = new AsyncLocalStorage<AuditRequestContext>();

export function getAuditContext(): AuditRequestContext | undefined {
  return auditContextStorage.getStore();
}

export function patchAuditContext(patch: Partial<AuditRequestContext>): void {
  const store = auditContextStorage.getStore();
  if (!store) {
    return;
  }
  Object.assign(store, patch);
}
