/** Supabase migration version prefixes required before Identity v1 can serve traffic. */
export const IDENTITY_REQUIRED_MIGRATIONS = [
  '202611060001',
  '202611060002',
  '202611060003',
  '202611060004',
  '202611060005',
] as const;

/** Latest identity DB schema marker — must match the newest required migration. */
export const IDENTITY_DB_SCHEMA_VERSION = '202611060005';
