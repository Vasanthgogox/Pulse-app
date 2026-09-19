/** Cloudflare / PostgREST "origin is gone" — retrying these is what turns a DB Unhealthy into a client storm. */
const ORIGIN_DOWN_STATUSES = new Set([503, 521]);

/** Transient proxy / rate-limit statuses that are worth a short retry. */
const TRANSIENT_RETRY_STATUSES = new Set([408, 425, 429, 500, 502, 504, 520, 522, 524]);

const ORIGIN_DOWN_MESSAGE =
  /503|521|57P03|not accepting connections|database system is shutting down|web server is down|origin is unreachable/i;

/** Normalize Cloudflare / HTML error bodies from Supabase into short retryable messages. */
export function normalizeInfrastructureErrorMessage(message: string): string {
  if (/<!doctype|error code 522|cloudflare|connection timed out/i.test(message)) {
    return 'Connection timed out (522)';
  }
  if (/json parse error|unexpected character|unexpected token/i.test(message)) {
    return 'Network request failed';
  }
  return message.length > 240 ? `${message.slice(0, 240)}…` : message;
}

export function isOriginDownHttpStatus(status: number): boolean {
  return ORIGIN_DOWN_STATUSES.has(status);
}

export function isOriginDownErrorMessage(message: string): boolean {
  return ORIGIN_DOWN_MESSAGE.test(message);
}

export function isOriginDownError(error: unknown): boolean {
  if (!error) return false;
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status === 'number' && ORIGIN_DOWN_STATUSES.has(status)) return true;
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && code.toUpperCase() === '57P03') return true;
  const message =
    error instanceof Error
      ? error.message
      : typeof (error as { message?: unknown }).message === 'string'
        ? ((error as { message: string }).message)
        : String(error);
  return isOriginDownErrorMessage(message);
}


export function isRetryableHttpResponse(res: Response): boolean {
  if (res.ok) return false;
  // 503 = PostgREST/Postgres unavailable. 521 = Cloudflare "web server is down".
  // Retrying either holds pool connections and multiplies load while the instance
  // is already Unhealthy (2026-09-18 incident: profiles/org_members 503 every ~2s).
  if (ORIGIN_DOWN_STATUSES.has(res.status)) return false;
  if (TRANSIENT_RETRY_STATUSES.has(res.status)) return true;
  const ct = (res.headers.get('content-type') ?? '').toLowerCase();
  return !ct.includes('json') && res.status >= 400;
}

export function isInfrastructureErrorMessage(message: string): boolean {
  return /522|521|520|500|502|503|504|429|timeout|timed out|network|fetch failed|gateway|connection|json parse|unexpected character|57P03/i.test(
    message,
  );
}

/**
 * PostgREST service-level failures: PGRST002 (schema cache could not be loaded)
 * and PGRST003 (could not acquire a pool connection). Both surface as 503 and
 * mean "the API layer is unavailable", never "this user has no rows".
 */
const SERVICE_UNAVAILABLE_CODES = new Set(['PGRST002', 'PGRST003']);

/**
 * True when a failure came from the API/DB layer being unavailable rather than
 * from the query itself. Callers use this to tell a transport failure apart
 * from a legitimate empty result, so an outage is surfaced once instead of
 * driving an application-level retry loop.
 */
export function isServiceUnavailableError(error: unknown): boolean {
  if (!error) return false;
  if (isOriginDownError(error)) return true;
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && SERVICE_UNAVAILABLE_CODES.has(code.toUpperCase())) {
    return true;
  }
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status === 'number' && status >= 500) return true;
  const message =
    error instanceof Error
      ? error.message
      : typeof (error as { message?: unknown } | null)?.message === 'string'
        ? (error as { message: string }).message
        : String(error);
  return /PGRST00[23]|schema cache/i.test(message);
}
