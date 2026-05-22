/** Postgres schema names used across the application. */
export const DatabaseSchemas = {
  /** Operational tables: users, sessions, auth-related data. */
  CORE: 'core',
  /** Reference / master data: roles, vehicles, and similar lookup tables. */
  MASTER: 'master',
} as const;
