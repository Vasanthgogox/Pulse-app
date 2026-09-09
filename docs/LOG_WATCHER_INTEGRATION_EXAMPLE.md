# Log Watcher Integration Examples

## Integrating with Existing Deno Functions

### Basic Error Logging

Wrap your function with error logging:

```typescript
// supabase/functions/my-function/index.ts
import { createClient } from 'npm:@supabase/supabase-js@2';

async function createSupabaseClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Missing config');
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

async function logToWatcher(
  supabase: ReturnType<typeof createClient>,
  level: 'error' | 'warn' | 'info',
  message: string,
  errorType: string,
  requestId?: string,
  statusCode?: number
) {
  try {
    await supabase.rpc('ingest_application_log', {
      p_service: 'my-function',
      p_level: level,
      p_message: message,
      p_error_type: errorType,
      p_request_id: requestId,
      p_status_code: statusCode,
      p_source: 'function',
    });
  } catch (logErr) {
    console.error('Failed to log to watcher:', logErr);
  }
}

Deno.serve(async (req) => {
  const supabase = await createSupabaseClient();
  const requestId = crypto.randomUUID();

  try {
    const body = await req.json();

    // Process request
    // ...

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const errorType = err instanceof Error ? err.constructor.name : 'UnknownError';

    // Log to watcher
    await logToWatcher(
      supabase,
      'error',
      message,
      errorType,
      requestId,
      500
    );

    // Also console.error for Deno logs
    console.error(`[my-function] error: ${message}`, { requestId });

    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
```

### Database Error Handling

```typescript
async function queryWithLogging(
  supabase: ReturnType<typeof createClient>,
  rpc: string,
  params: Record<string, any>,
  requestId: string,
  route?: string
) {
  try {
    const { data, error } = await supabase.rpc(rpc, params);
    if (error) throw error;
    return data;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // Check if it's a database error
    const isDbError = message.includes('connection') ||
                      message.includes('timeout') ||
                      message.includes('pool');

    await supabase.rpc('ingest_application_log', {
      p_service: 'api',
      p_level: 'error',
      p_message: `RPC ${rpc} failed: ${message}`,
      p_error_type: isDbError ? 'DatabaseError' : 'RPCError',
      p_request_id: requestId,
      p_route: route || `/rpc/${rpc}`,
      p_method: 'RPC',
      p_status_code: isDbError ? 503 : 500,
      p_source: 'function',
    });

    throw err;
  }
}
```

### Performance Logging

```typescript
async function timedRequest(
  supabase: ReturnType<typeof createClient>,
  operation: () => Promise<any>,
  service: string,
  route: string,
  method: string
) {
  const startTime = performance.now();
  let statusCode = 200;

  try {
    const result = await operation();
    return result;
  } catch (err) {
    statusCode = 500;
    throw err;
  } finally {
    const latencyMs = performance.now() - startTime;

    // Log slow requests (>1000ms)
    if (latencyMs > 1000) {
      await supabase.rpc('ingest_application_log', {
        p_service: service,
        p_level: statusCode >= 500 ? 'error' : 'warn',
        p_message: `Slow ${method} ${route} took ${latencyMs.toFixed(0)}ms`,
        p_error_type: 'PerformanceWarning',
        p_route: route,
        p_method: method,
        p_status_code: statusCode,
        p_latency_ms: latencyMs,
        p_source: 'function',
      });
    }
  }
}

// Usage
await timedRequest(
  supabase,
  () => queryWithLogging(supabase, 'get_user_profile', { id }, reqId),
  'api',
  '/api/users/:id',
  'GET'
);
```

### Rate Limit Tracking

```typescript
async function checkRateLimit(
  supabase: ReturnType<typeof createClient>,
  ip: string,
  limit: number,
  windowMs: number
) {
  // ... rate limit check logic ...

  if (rateLimitExceeded) {
    await supabase.rpc('ingest_application_log', {
      p_service: 'api',
      p_level: 'warn',
      p_message: `Rate limit exceeded for IP ${ip}`,
      p_error_type: 'RateLimitExceeded',
      p_status_code: 429,
      p_metadata: JSON.stringify({ ip, limit, windowMs, requests: count }),
      p_source: 'function',
    });

    return false;
  }

  return true;
}
```

## Integrating with Browser/Web Client

### Fetch Error Handler Wrapper

```typescript
// lib/fetchWithLogging.ts
import { supabaseAuth } from '@/lib/supabaseAuth';

export async function fetchWithLogging(
  url: string,
  options?: RequestInit,
  context?: { route?: string; userId?: string }
) {
  const startTime = performance.now();
  const method = options?.method || 'GET';

  try {
    const response = await fetch(url, options);
    const latency = performance.now() - startTime;

    // Log slow requests
    if (latency > 3000 || !response.ok) {
      await supabaseAuth.rpc('ingest_application_log', {
        p_service: 'web-app',
        p_level: !response.ok ? 'error' : 'warn',
        p_message: `${method} ${url} → ${response.status}`,
        p_error_type: response.status >= 500 ? 'ServerError' : 'ClientError',
        p_route: context?.route || url,
        p_method: method,
        p_status_code: response.status,
        p_latency_ms: latency,
        p_user_id_hash: context?.userId ? await hashUserId(context.userId) : null,
        p_source: 'browser',
      }).catch(() => {
        // Silently fail if logging doesn't work (don't break app)
      });
    }

    return response;
  } catch (err) {
    const latency = performance.now() - startTime;

    // Log network errors
    await supabaseAuth.rpc('ingest_application_log', {
      p_service: 'web-app',
      p_level: 'error',
      p_message: `Network error: ${err instanceof Error ? err.message : String(err)}`,
      p_error_type: 'NetworkError',
      p_route: context?.route || url,
      p_method: method,
      p_latency_ms: latency,
      p_user_id_hash: context?.userId ? await hashUserId(context.userId) : null,
      p_source: 'browser',
    }).catch(() => {});

    throw err;
  }
}

// Usage
const response = await fetchWithLogging('/api/trips', {
  method: 'POST',
  body: JSON.stringify(tripData)
}, {
  route: '/api/trips',
  userId: userId  // Will be hashed before sending
});
```

### React Error Boundary Integration

```typescript
// components/ErrorBoundary.tsx
import React from 'react';
import { supabaseAuth } from '@/lib/supabaseAuth';

interface Props {
  children: React.ReactNode;
  context?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log to watcher
    supabaseAuth
      .rpc('ingest_application_log', {
        p_service: 'web-app',
        p_level: 'error',
        p_message: error.message,
        p_error_type: 'ReactError',
        p_metadata: JSON.stringify({
          componentStack: errorInfo.componentStack,
          context: this.props.context,
        }),
        p_source: 'browser',
      })
      .catch(() => {}); // Silently fail
  }

  render() {
    if (this.state.hasError) {
      return <div>Something went wrong. Please refresh the page.</div>;
    }

    return this.props.children;
  }
}
```

## Best Practices

### 1. Always Log Complete Context

```typescript
// ✅ Good
await ingest({
  p_message: 'Payment processing failed',
  p_error_type: 'PaymentError',
  p_request_id: requestId,
  p_route: '/api/payments',
  p_method: 'POST',
  p_status_code: 402,
  p_latency_ms: duration,
  p_metadata: JSON.stringify({
    orderId: orderId,
    paymentMethod: 'razorpay',
    amount: amount
  })
});

// ❌ Avoid
await ingest({
  p_message: 'Error',
  p_source: 'function'
});
```

### 2. Never Log Sensitive Data

```typescript
// ❌ DON'T
await ingest({
  p_message: `Payment failed for card ${cardNumber}`,
  p_metadata: JSON.stringify({ password, apiKey })
});

// ✅ DO
await ingest({
  p_message: 'Payment processing failed',
  p_metadata: JSON.stringify({
    cardLastFour: cardNumber.slice(-4),
    paymentGateway: 'razorpay'
  })
});
```

### 3. Batch Related Logs

```typescript
// ✅ Good - Single request, multiple checks
const errors = [];
if (!email) errors.push('email_missing');
if (!password) errors.push('password_missing');
if (errors.length > 0) {
  await ingest({
    p_message: `Validation failed: ${errors.join(', ')}`,
    p_error_type: 'ValidationError'
  });
}

// ❌ Avoid - Multiple RPC calls
if (!email) await ingest({ p_message: 'email_missing' });
if (!password) await ingest({ p_message: 'password_missing' });
```

### 4. Use Correlation IDs

```typescript
// Use request ID to trace a user's action through multiple services
const correlationId = crypto.randomUUID();

// Function 1: API Gateway
await ingest({
  p_request_id: correlationId,
  p_message: 'User initiated trip booking'
});

// Function 2: Database
await ingest({
  p_request_id: correlationId,
  p_message: 'Trip saved to database'
});

// Function 3: Payment
await ingest({
  p_request_id: correlationId,
  p_message: 'Payment processed'
});

// Later, query by correlation ID to see full flow
SELECT * FROM ops.log_events WHERE request_id = correlationId ORDER BY captured_at;
```
