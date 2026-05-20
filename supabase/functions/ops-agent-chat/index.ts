// Ops Agent proxy: holds GEMINI_API_KEY server-side; app sends anon key in Authorization and user JWT in X-User-Token.
// Deploy: supabase functions deploy ops-agent-chat --set GEMINI_API_KEY=your-key
// Security: REST token verification, per-user DB-backed rate limit (20/min, shared across isolates), CORS, security event logging, error scrubbing.

const GEMINI_MODEL = 'gemini-2.0-flash';
const ALLOWED_GEMINI_MODELS = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_PER_USER = 20;

/** Log payload size (chars) above this may be logged as suspicious_prompt for review. No prompt text is logged. */
const SUSPICIOUS_PROMPT_LENGTH = 50_000;
/** Max total chars for systemInstruction + tools JSON to prevent DoS from huge nested objects. */
const MAX_PAYLOAD_META_LENGTH = 100_000;

const corsAllowHeaders = 'authorization, x-client-info, apikey, content-type, x-user-token';

function getClientIp(req: Request): string | null {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? null;
}

function requestId(): string {
  return crypto.randomUUID?.() ?? `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Security event for detection: bot attacks, token abuse, prompt injection attempts. Emit to console for Supabase logs. */
function logSecurityEvent(event: {
  type: 'auth_failure' | 'rate_limit' | 'invalid_request' | 'suspicious_prompt';
  userId?: string;
  ip?: string | null;
  detail?: string;
  time: string;
  requestId?: string;
}) {
  const payload = { ...event, time: event.time || new Date().toISOString() };
  console.warn('SECURITY_EVENT', JSON.stringify(payload));
}

/** Run a promise in the background without delaying the response. Use for async logging. */
function runInBackground(p: Promise<unknown>): void {
  void p.catch((e) => console.warn('[ops-agent-chat] background task failed:', e));
}

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
    'Access-Control-Allow-Credentials': 'true',
  };
}

type RateLimitRpcResult = { allowed: boolean; count?: number };

function parseRateLimitRpcPayload(data: unknown): RateLimitRpcResult | null {
  const row = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : (data as Record<string, unknown> | undefined);
  if (!row || typeof row !== 'object') return null;
  if (typeof row.allowed === 'boolean') {
    return { allowed: row.allowed, count: typeof row.count === 'number' ? row.count : undefined };
  }
  const wrapped = row.ops_agent_rate_limit_try_consume;
  if (wrapped && typeof wrapped === 'object' && typeof (wrapped as { allowed?: unknown }).allowed === 'boolean') {
    const w = wrapped as { allowed: boolean; count?: number };
    return { allowed: w.allowed, count: w.count };
  }
  return null;
}

/** Shared counter in Postgres (see migration ops_agent_edge_rate_limit); requires SUPABASE_SERVICE_ROLE_KEY in the function env. */
async function tryConsumeDbRateLimit(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
): Promise<'ok' | 'rate_limited' | 'rpc_error'> {
  const url = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/ops_agent_rate_limit_try_consume`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_user_id: userId,
      p_max_per_window: RATE_LIMIT_MAX_PER_USER,
      p_window_seconds: Math.round(RATE_LIMIT_WINDOW_MS / 1000),
    }),
  });
  if (!res.ok) {
    console.warn('[ops-agent-chat] rate limit RPC HTTP', res.status, await res.text().then((t) => t.slice(0, 300)));
    return 'rpc_error';
  }
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return 'rpc_error';
  }
  const parsed = parseRateLimitRpcPayload(data);
  if (!parsed) return 'rpc_error';
  return parsed.allowed ? 'ok' : 'rate_limited';
}

function jsonResponse(body: object, status: number, req: Request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}

/** Verify JWT with Supabase Auth REST API to avoid SDK signature differences across versions. */
async function verifyToken(supabaseUrl: string, supabaseAnonKey: string, token: string): Promise<{ user?: { id: string }; error?: string; code?: string }> {
  const url = `${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const text = await res.text();
    let err: { message?: string; msg?: string; error_description?: string } = {};
    try {
      err = JSON.parse(text);
    } catch {
      err = { message: text.slice(0, 200) };
    }
    const message = err.message ?? err.msg ?? err.error_description ?? res.statusText;
    return { error: message, code: String(res.status) };
  }
  const json = await res.json();
  const user = json?.user ?? json;
  if (!user?.id) return { error: 'no_user', code: 'invalid_response' };
  return { user: { id: user.id } };
}

function scrubSecret(text: string, secret: string): string {
  if (!secret || secret.length < 8) return text;
  return text.split(secret).join('[REDACTED]');
}

Deno.serve(async (req) => {
  const reqId = requestId();

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405, req);
  }

  const userToken = req.headers.get('X-User-Token')?.trim();
  if (!userToken) {
    logSecurityEvent({ type: 'auth_failure', ip: getClientIp(req), detail: 'missing_x_user_token', time: new Date().toISOString(), requestId: reqId });
    return jsonResponse({ error: 'Missing user token', detail: 'Send the user access token in the X-User-Token header.' }, 401, req);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    logSecurityEvent({ type: 'invalid_request', ip: getClientIp(req), detail: 'invalid_json', time: new Date().toISOString(), requestId: reqId });
    return jsonResponse({ error: 'Invalid JSON body' }, 400, req);
  }

  const rawPayload = body as Record<string, unknown>;

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse({ error: 'Server configuration error' }, 503, req);
  }

  const verification = await verifyToken(supabaseUrl, supabaseAnonKey, userToken);
  if (verification.error || !verification.user) {
    const reason = verification.error?.trim() || 'no_user';
    const host = supabaseUrl ? new URL(supabaseUrl).hostname : 'missing';
    console.warn('[ops-agent-chat] JWT verification failed:', { reason, code: verification.code, host, requestId: reqId });
    logSecurityEvent({ type: 'auth_failure', ip: getClientIp(req), detail: reason, time: new Date().toISOString(), requestId: reqId });
    return jsonResponse({ error: 'Invalid or expired token', detail: reason }, 401, req);
  }

  const user = verification.user;

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceRoleKey) {
    return jsonResponse({ error: 'Server configuration error', detail: 'Rate limit requires service role key' }, 503, req);
  }

  const rateOutcome = await tryConsumeDbRateLimit(supabaseUrl, serviceRoleKey, user.id);
  if (rateOutcome === 'rpc_error') {
    return jsonResponse({ error: 'Service temporarily unavailable', detail: 'Rate limit check failed' }, 503, req);
  }
  if (rateOutcome === 'rate_limited') {
    logSecurityEvent({ type: 'rate_limit', userId: user.id, ip: getClientIp(req), time: new Date().toISOString(), requestId: reqId });
    return jsonResponse(
      { error: 'Too many requests. Limit 20 per minute.' },
      429,
      req
    );
  }

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    return jsonResponse({ error: 'Ops Agent proxy not configured' }, 503, req);
  }

  const model = ALLOWED_GEMINI_MODELS.includes(GEMINI_MODEL) ? GEMINI_MODEL : 'gemini-2.0-flash';
  const geminiUrl = `${GEMINI_BASE}/${model}:generateContent`;

  const payload = rawPayload;
  const { contents, systemInstruction, tools, toolConfig } = payload;

  if (!contents || !Array.isArray(contents)) {
    logSecurityEvent({ type: 'invalid_request', userId: user.id, ip: getClientIp(req), detail: 'missing_contents', time: new Date().toISOString(), requestId: reqId });
    return jsonResponse({ error: 'contents array required' }, 400, req);
  }

  const totalContentLength = JSON.stringify(contents).length;
  if (totalContentLength > SUSPICIOUS_PROMPT_LENGTH) {
    runInBackground(Promise.resolve(logSecurityEvent({ type: 'suspicious_prompt', userId: user.id, ip: getClientIp(req), detail: `length=${totalContentLength}`, time: new Date().toISOString(), requestId: reqId })));
  }

  const metaLength = (systemInstruction != null ? JSON.stringify(systemInstruction).length : 0) +
    (tools != null ? JSON.stringify(tools).length : 0) +
    (toolConfig != null ? JSON.stringify(toolConfig).length : 0);
  if (metaLength > MAX_PAYLOAD_META_LENGTH) {
    return jsonResponse({ error: 'Payload too large', detail: 'systemInstruction/tools exceed size limit' }, 400, req);
  }

  const geminiBody: Record<string, unknown> = {
    contents,
    ...(systemInstruction != null && { systemInstruction }),
    ...(tools != null && { tools }),
    ...(toolConfig != null && { toolConfig }),
  };

  const geminiRes = await fetch(geminiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify(geminiBody),
  });

  if (!geminiRes.ok) {
    const rawErrText = await geminiRes.text();
    console.warn('[ops-agent-chat] Gemini non-OK:', geminiRes.status, scrubSecret(rawErrText, apiKey));
    const detail = scrubSecret(rawErrText, apiKey).slice(0, 500);
    return jsonResponse(
      { error: 'Gemini request failed', detail },
      502,
      req
    );
  }

  const geminiJson = await geminiRes.json() as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string; functionCall?: { name?: string; args?: unknown; id?: string } }> };
    }>;
  };

  const candidate = geminiJson.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  let text = '';
  const functionCalls: Array<{ name: string; args: Record<string, unknown>; id?: string }> = [];
  for (const part of parts) {
    if (part.text) text += part.text;
    if (part.functionCall) {
      functionCalls.push({
        name: part.functionCall.name ?? '',
        args: (part.functionCall.args as Record<string, unknown>) ?? {},
        id: part.functionCall.id,
      });
    }
  }

  const out = {
    text,
    functionCalls: functionCalls.length > 0 ? functionCalls : undefined,
    candidates: geminiJson.candidates,
  };

  return jsonResponse(out, 200, req);
});
