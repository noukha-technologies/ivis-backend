/**
 * Data-access scope carried by a Role. Orthogonal to the permission matrix
 * (which controls module/action). Scope controls WHICH centres' data the
 * role's users can see/act on.
 *
 * - `global` → Super Admin: all centres, no centre filter. User.center_id is null.
 * - `centre` → Centre Admin (and any centre-scoped role): restricted to the
 *   user's single assigned centre (User.center_id, required).
 *
 * A role has exactly one scope, so a user can never be both.
 */
export const ACCESS_SCOPES = ['global', 'centre'] as const;

export type AccessScope = (typeof ACCESS_SCOPES)[number];

export const DEFAULT_ACCESS_SCOPE: AccessScope = 'centre';

export function isGlobalScope(scope?: string | null): boolean {
  return scope === 'global';
}
