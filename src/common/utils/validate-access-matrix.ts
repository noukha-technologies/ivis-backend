import { BadRequestException } from '@nestjs/common';
import {
  APPOINTMENTS_SUBMODULES,
  MASTER_MANAGEMENT_SUBMODULES,
  type RoleAccessMatrix,
  ROLE_ACCESS_MODULES,
  SUBMODULE_MODULES,
  TRANSACTIONS_SUBMODULES,
  USER_MANAGEMENT_SUBMODULES,
} from '../types/role-access.types';
import { normalizeRoleAccessMatrix } from '../auth/role-permissions';

const SUBMODULE_KEYS: Record<string, readonly string[]> = {
  appointments:      APPOINTMENTS_SUBMODULES,
  master_management: MASTER_MANAGEMENT_SUBMODULES,
  transactions:      TRANSACTIONS_SUBMODULES,
  user_management:   USER_MANAGEMENT_SUBMODULES,
};

function isModuleCrudFlags(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.view === 'boolean' &&
    typeof entry.create === 'boolean' &&
    typeof entry.edit === 'boolean'
  );
}

function validateSubmodules(
  moduleName: string,
  submodulesValue: unknown,
  expectedKeys: readonly string[],
): void {
  if (!submodulesValue || typeof submodulesValue !== 'object' || Array.isArray(submodulesValue)) {
    throw new BadRequestException(
      `Module "${moduleName}" must have a "submodules" object.`,
    );
  }
  const sub = submodulesValue as Record<string, unknown>;

  for (const key of expectedKeys) {
    if (!isModuleCrudFlags(sub[key])) {
      throw new BadRequestException(
        `Submodule "${moduleName}.${key}" is missing or has malformed access flags (view, create, edit must be booleans).`,
      );
    }
  }

  for (const key of Object.keys(sub)) {
    if (!expectedKeys.includes(key)) {
      throw new BadRequestException(
        `Unknown submodule "${key}" in module "${moduleName}".`,
      );
    }
  }
}

export function validateAccessMatrix(access: unknown): RoleAccessMatrix {
  if (!access || typeof access !== 'object' || Array.isArray(access)) {
    throw new BadRequestException('Permission access must be a non-empty object.');
  }

  const record = access as Record<string, unknown>;
  if (Object.keys(record).length === 0) {
    throw new BadRequestException('Permission access matrix cannot be empty.');
  }

  // All 8 top-level modules must be present with valid flags
  for (const mod of ROLE_ACCESS_MODULES) {
    const entry = record[mod];
    if (!isModuleCrudFlags(entry)) {
      throw new BadRequestException(
        `Module "${mod}" is missing or has malformed access flags (view, create, edit must be booleans).`,
      );
    }
  }

  // Reject unknown top-level keys
  for (const key of Object.keys(record)) {
    if (!ROLE_ACCESS_MODULES.includes(key as (typeof ROLE_ACCESS_MODULES)[number])) {
      throw new BadRequestException(`Unknown module "${key}" in permission access matrix.`);
    }
  }

  // Validate nested submodules for modules that require them
  for (const mod of SUBMODULE_MODULES) {
    const entry = record[mod] as Record<string, unknown>;
    validateSubmodules(mod, entry['submodules'], SUBMODULE_KEYS[mod]);
  }

  return normalizeRoleAccessMatrix(record as Partial<RoleAccessMatrix>);
}
