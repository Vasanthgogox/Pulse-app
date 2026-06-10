// Check if a phone is already registered (profiles table). Used before sign-up to redirect
// existing users to sign-in with email prefilled. No auth required; rate-limited by IP.
// For scale: add in pulse-unified-base an RPC that normalizes phone and returns email (indexed).

const corsAllowHeaders = 'authorization, x-client-info, apikey, content-type';

function getCorsOrigin(req: Request): string {
  const allowed = Deno.env.get('CORS_ALLOWED_ORIGIN')?.trim();
  if (!allowed) return '*';
  const origin = req.headers.get('Origin');
  if (origin && origin === allowed) return origin;
  return 'null';
}

function corsHeaders(req: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': getCorsOrigin(req),
    'Access-Control-Allow-Headers': corsAllowHeaders,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function jsonResponse(body: object, status: number, req: Request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}

/** Normalize to 10 digits (matches get_invitee_by_phone: digits only, 91 prefix → last 10). */
function toTenDigits(phone: string): string | null {
  const trimmed = (phone ?? '').trim();
  if (trimmed.length === 0) return null;
  const digits = trimmed.replace(/\s+/g, '').replace(/\D/g, '');
  if (digits.length >= 12 && digits.startsWith('91')) return digits.slice(-10);
  if (digits.length >= 10) return digits.slice(-10);
  return digits.length === 0 ? null : digits;
}

/** Mask email for display (e.g. ni***@gmail.com). */
function maskEmail(email: string): string {
  const trimmed = (email ?? '').trim();
  if (trimmed.length === 0) return '';
  const at = trimmed.indexOf('@');
  if (at <= 0) return '***';
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at);
  if (local.length <= 2) return local[0] + '***' + domain;
  return local.slice(0, 2) + '***' + domain;
}

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_PER_IP = 30;
const rateLimitMap = new Map<string, number[]>();

function pruneAndCheckRateLimit(ip: string): boolean {
  const now = Date.now();
  const list = rateLimitMap.get(ip) ?? [];
  const kept = list.filter((t) => now - t < RATE_LIMIT_WINDOW_MS).slice(-RATE_LIMIT_MAX_PER_IP);
  if (kept.length >= RATE_LIMIT_MAX_PER_IP) return false;
  kept.push(now);
  rateLimitMap.set(ip, kept);
  return true;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405, req);
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? 'unknown';
  if (!pruneAndCheckRateLimit(ip)) {
    return jsonResponse({ error: 'Too many requests. Try again in a minute.' }, 429, req);
  }

  let body: { phone?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400, req);
  }

  const rawPhone = body?.phone != null ? String(body.phone) : '';
  const normalized = toTenDigits(rawPhone);
  if (!normalized || normalized.length !== 10) {
    return jsonResponse(
      { error: 'Invalid phone', detail: 'Provide a 10-digit number or +91 followed by 10 digits.' },
      400,
      req
    );
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Server configuration error' }, 503, req);
  }

  const { createClient } = await import('npm:@supabase/supabase-js@2');
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Fast path: use RPC get_email_by_phone (single query, no bulk fetch)
  const { data: emailRpc, error: rpcError } = await supabase.rpc('get_email_by_phone', {
    p_phone: normalized,
  });

  if (!rpcError && emailRpc != null && typeof emailRpc === 'string' && emailRpc.trim() !== '') {
    const email = emailRpc.trim();
    return jsonResponse(
      { exists: true, email, masked_email: maskEmail(email) },
      200,
      req
    );
  }
  if (!rpcError) {
    return jsonResponse({ exists: false }, 200, req);
  }

  // Fallback: RPC may not exist (old DB) — fetch profiles and normalize in JS
  const { data: rows, error } = await supabase
    .from('profiles')
    .select('id, email, phone')
    .not('phone', 'is', null)
    .limit(10_000);

  if (error) {
    console.warn('[check-user-by-phone] lookup failed:', error.message);
    return jsonResponse({ error: 'Lookup failed', detail: error.message }, 502, req);
  }

  const list = Array.isArray(rows) ? rows : [];
  for (const row of list) {
    const stored = row?.phone != null ? String(row.phone) : '';
    const storedTen = toTenDigits(stored);
    if (storedTen === normalized) {
      const email = (row?.email != null ? String(row.email) : '').trim();
      if (!email) continue;
      return jsonResponse(
        { exists: true, email, masked_email: maskEmail(email) },
        200,
        req
      );
    }
  }

  return jsonResponse({ exists: false }, 200, req);
});
