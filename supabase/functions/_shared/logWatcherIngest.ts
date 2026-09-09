// Shared log watcher ingestion helper
// Use this in Deno functions to automatically report errors/warnings to the Log Watcher

import { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export interface LogContext {
  service?: string;
  requestId?: string;
  route?: string;
  method?: string;
  statusCode?: number;
  latencyMs?: number;
  source?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Sanitize a string to remove secrets before logging
 */
function sanitizeForLogging(value: string): string {
  if (!value) return value;

  // Remove common secret patterns
  return value
    .replace(/Bearer\s+[A-Za-z0-9_\-\.]+/gi, 'Bearer [REDACTED]')
    .replace(/api[_-]?key[=:\s]+[A-Za-z0-9_\-\.]+/gi, 'api_key=[REDACTED]')
    .replace(/password[=:\s]+[^\s,}]+/gi, 'password=[REDACTED]')
    .replace(/token[=:\s]+[A-Za-z0-9_\-\.]+/gi, 'token=[REDACTED]')
    .replace(/secret[=:\s]+[A-Za-z0-9_\-\.]+/gi, 'secret=[REDACTED]')
    .replace(/\b\d{16,19}\b/g, '[REDACTED_CARD]')
    .replace(/sk-ant-[A-Za-z0-9_\-]+/gi, '[REDACTED_ANTHROPIC_KEY]');
}

/**
 * Ingest an error or warning to the Log Watcher
 * Call this from error handlers in Deno functions
 */
export async function ingestLog(
  supabase: SupabaseClient,
  level: 'error' | 'warn' | 'info' | 'debug',
  message: string,
  errorType?: string,
  context?: LogContext
): Promise<void> {
  try {
    // Sanitize the message
    const sanitizedMessage = sanitizeForLogging(message);

    // Sanitize metadata values
    let sanitizedMetadata: Record<string, unknown> | undefined;
    if (context?.metadata) {
      sanitizedMetadata = {};
      for (const [key, value] of Object.entries(context.metadata)) {
        if (typeof value === 'string') {
          sanitizedMetadata[key] = sanitizeForLogging(value);
        } else if (value instanceof Error) {
          sanitizedMetadata[key] = {
            name: value.name,
            message: sanitizeForLogging(value.message),
          };
        } else {
          sanitizedMetadata[key] = value;
        }
      }
    }

    // Call the RPC to ingest the log
    await supabase.rpc('ingest_application_log', {
      p_service: context?.service || 'edge-function',
      p_level: level,
      p_message: sanitizedMessage,
      p_error_type: errorType,
      p_request_id: context?.requestId,
      p_route: context?.route,
      p_method: context?.method,
      p_status_code: context?.statusCode,
      p_latency_ms: context?.latencyMs,
      p_metadata: sanitizedMetadata,
      p_source: context?.source || 'function',
    });
  } catch (logError) {
    // Never let logging errors crash the function
    console.error('[log-watcher-ingest] Failed to ingest log:', logError);
  }
}

/**
 * Wrap a Deno function handler to automatically log errors
 * Usage:
 *
 *  Deno.serve(withLogging(async (req) => {
 *    // your handler
 *  }, { service: 'my-function' }))
 */
export function withLogging(
  handler: (req: Request) => Promise<Response>,
  defaultContext?: Partial<LogContext> & { service: string }
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const startTime = performance.now();

    try {
      const response = await handler(req);

      // Log if it's an error response
      if (!response.ok) {
        const latency = performance.now() - startTime;
        console.warn(
          `[${defaultContext?.service || 'function'}] ${req.method} ${req.url} → ${response.status}`,
        );
      }

      return response;
    } catch (error) {
      const latency = performance.now() - startTime;
      const message = error instanceof Error ? error.message : String(error);
      const errorType = error instanceof Error ? error.constructor.name : 'UnknownError';

      console.error(
        `[${defaultContext?.service || 'function'}] Error: ${message}`,
        error,
      );

      // Try to log to watcher (but don't fail if it errors)
      if (defaultContext?.service) {
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

        if (supabaseUrl && serviceKey) {
          const { createClient } = await import('npm:@supabase/supabase-js@2');
          const supabase = createClient(supabaseUrl, serviceKey, {
            auth: { persistSession: false },
          });

          await ingestLog(
            supabase,
            'error',
            message,
            errorType,
            {
              ...defaultContext,
              statusCode: 500,
              latencyMs: latency,
              source: 'function',
            }
          );
        }
      }

      return new Response(
        JSON.stringify({ error: message }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  };
}
