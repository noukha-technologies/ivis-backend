/** PostgreSQL schema names used by TypeORM entities and migrations. */
export const DATABASE_SCHEMAS = {
  CORE: 'core',
  MASTER: 'master',
  TRANSACTION: 'transaction',
} as const;

export type DatabaseSchema =
  (typeof DATABASE_SCHEMAS)[keyof typeof DATABASE_SCHEMAS];
