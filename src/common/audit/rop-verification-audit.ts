import { patchAuditContext } from './audit-context';
import { stashAuditEntityDetails } from './audit-entity-details.stash';
import type { RopVerification } from '../../modules/database/entity/rop-verification.entity';

export type RopVerificationAuditSnapshot = {
  rop_verification_id: number;
  plate_number?: string | null;
  reg_no?: string | null;
  owner_name?: string | null;
  vehicle_make?: string | null;
  vehicle_model?: string | null;
  chassis_no?: string | null;
  insurance?: string | null;
  reg_expiry?: string | null;
  fetch_status?: string | null;
};

export const EMPTY_ROP_VERIFICATION_AUDIT: RopVerificationAuditSnapshot = {
  rop_verification_id: 0,
  plate_number: null,
  reg_no: null,
  owner_name: null,
  vehicle_make: null,
  vehicle_model: null,
  chassis_no: null,
  insurance: null,
  reg_expiry: null,
  fetch_status: null,
};

function formatRegExpiry(value: Date | string | null | undefined): string | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
}

export function snapshotRopVerification(
  rop: RopVerification,
  plateNumber?: string | null,
): RopVerificationAuditSnapshot {
  return {
    rop_verification_id: rop.rop_verification_id,
    plate_number: plateNumber ?? null,
    reg_no: rop.reg_no ?? null,
    owner_name: rop.owner_name ?? null,
    vehicle_make: rop.vehicle_make ?? null,
    vehicle_model: rop.vehicle_model ?? null,
    chassis_no: rop.chassis_no ?? null,
    insurance: rop.insurance ?? null,
    reg_expiry: formatRegExpiry(rop.reg_expiry),
    fetch_status: rop.fetch_status ?? null,
  };
}

export function applyRopVerificationAuditContext(
  entityId: string,
  before: RopVerificationAuditSnapshot,
  after: RopVerificationAuditSnapshot,
): void {
  patchAuditContext({
    ropVerificationAuditDetails: { ...after },
    ropVerificationAuditDetailsBefore: { ...before },
  });
  stashAuditEntityDetails('RopVerification', entityId, {
    after: { ...after },
    before: { ...before },
  });
}

export function clearRopVerificationAuditContext(): void {
  patchAuditContext({
    ropVerificationAuditDetails: null,
    ropVerificationAuditDetailsBefore: null,
  });
}
