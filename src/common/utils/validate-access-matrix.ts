import { BadRequestException } from '@nestjs/common';
import {
  ROLE_ACCESS_MODULES,
  type RoleAccessMatrix,
  type RoleAccessModule,
} from '../types/role-access.types';
import { normalizeRoleAccessMatrix } from '../auth/role-permissions';

function isModuleCrudFlags(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.view === 'boolean' &&
    typeof entry.create === 'boolean' &&
    typeof entry.edit === 'boolean'
  );
}

export function validateAccessMatrix(access: unknown): RoleAccessMatrix {
  if (!access || typeof access !== 'object' || Array.isArray(access)) {
    throw new BadRequestException('Permission access must be a non-empty object.');
  }

  const record = access as Record<string, unknown>;
  if (Object.keys(record).length === 0) {
    throw new BadRequestException('Permission access matrix cannot be empty.');
  }

  for (const mod of ROLE_ACCESS_MODULES) {
    const entry = record[mod];
    if (!isModuleCrudFlags(entry)) {
      throw new BadRequestException(
        `Module "${mod}" is missing or has malformed access flags (view, create, edit must be booleans).`,
      );
    }
  }

  for (const key of Object.keys(record)) {
    if (!ROLE_ACCESS_MODULES.includes(key as RoleAccessModule)) {
      throw new BadRequestException(`Unknown module "${key}" in permission access matrix.`);
    }
  }

  return normalizeRoleAccessMatrix(
    record as Partial<Record<RoleAccessModule, Partial<RoleAccessMatrix[RoleAccessModule]>>>,
  );
}
