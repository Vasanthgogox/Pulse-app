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

export function isRetryableHttpResponse(res: Response): boolean {
  if (res.ok) return false;
  if ([408, 425, 429, 500, 502, 503, 504, 520, 522, 524].includes(res.status)) {
    return true;
  }
  const ct = (res.headers.get('content-type') ?? '').toLowerCase();
  return !ct.includes('json') && res.status >= 400;
}

export function isInfrastructureErrorMessage(message: string): boolean {
  return /522|520|500|502|503|504|429|timeout|timed out|network|fetch failed|gateway|connection|json parse|unexpected character/i.test(
    message,
  );
}
