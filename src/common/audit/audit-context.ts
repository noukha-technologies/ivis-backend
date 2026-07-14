import { AsyncLocalStorage } from 'async_hooks';

export type AuditRequestContext = {
  userId?: string;
  userName?: string;
  ipAddress?: string;
  userAgent?: string;
};

export const auditContextStorage =
  new AsyncLocalStorage<AuditRequestContext>();

export function getAuditContext(): AuditRequestContext | undefined {
  return auditContextStorage.getStore();
}

export function patchAuditContext(
  patch: Partial<AuditRequestContext>,
): void {
  const store = auditContextStorage.getStore();
  if (!store) {
    return;
  }
  Object.assign(store, patch);
}
