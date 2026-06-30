/** Frozen error envelope — never remove fields; only add optional ones. */

export interface ApiErrorBody {
  code:     string;
  message:  string;
  details?: Record<string, unknown>;
}

export interface ApiErrorResponse {
  success: false;
  error:   ApiErrorBody;
}

/** Standard success envelope. */
export interface ApiSuccessResponse<T> {
  success: true;
  data:    T;
  meta:    import('./metadata').ResponseMeta;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export const ErrorCodes = {
  UNAUTHORIZED:          'UNAUTHORIZED',
  FORBIDDEN:             'FORBIDDEN',
  NOT_FOUND:             'NOT_FOUND',
  VALIDATION_ERROR:      'VALIDATION_ERROR',
  ORG_ALREADY_EXISTS:    'ORG_ALREADY_EXISTS',
  INVITE_ALREADY_PENDING:'INVITE_ALREADY_PENDING',
  INVALID_CREDENTIALS:   'INVALID_CREDENTIALS',
  CONFLICT:              'CONFLICT',
  INTERNAL_ERROR:        'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export class PlatformError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly status: number = 400,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'PlatformError';
  }
}

export function errorResponse(
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>,
): ApiErrorResponse {
  return { success: false, error: { code, message, details } };
}

export function successResponse<T>(
  data: T,
  meta: import('./metadata').ResponseMeta,
): ApiSuccessResponse<T> {
  return { success: true, data, meta };
}
