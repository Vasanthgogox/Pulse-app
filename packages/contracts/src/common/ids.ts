/** Canonical ID prefixes — oms/docs/PLATFORM_ENTITY_MODEL.md */

export const ID_PREFIX = {
  TENANT:       'TENANT',
  ORGANIZATION: 'ORG',
  BUSINESS_UNIT:'BU',
  WAREHOUSE:    'WH',
  USER:         'USR',
  MEMBERSHIP:   'MEM',
  INVITATION:   'INV',
  PRODUCT:      'PRD',
  CUSTOMER:     'CUS',
  CORRELATION:  'COR',
} as const;

export type IdPrefix = (typeof ID_PREFIX)[keyof typeof ID_PREFIX];

export type CanonicalId = `${IdPrefix}-${string}`;

export const ID_PATTERNS = {
  TENANT:        /^TENANT-\d{6}$/,
  ORGANIZATION:  /^ORG-\d{6}$/,
  BUSINESS_UNIT: /^BU-\d{6}$/,
  WAREHOUSE:     /^WH-\d{6}$/,
  USER:          /^USR-\d{6}$/,
  MEMBERSHIP:    /^MEM-\d{6}$/,
  INVITATION:    /^INV-\d{6}$/,
} as const;
