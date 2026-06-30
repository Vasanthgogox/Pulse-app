export const SCHEMA_VERSION = 'v1' as const;

export type SchemaVersion = typeof SCHEMA_VERSION;

/** Standard lifecycle metadata for platform entities. */
export interface EntityMetadata {
  createdAt: string;
  updatedAt?: string;
}

/** Frozen API response meta block. */
export interface ResponseMeta {
  requestId:     string;
  schemaVersion: SchemaVersion;
  correlationId?: string;
}
