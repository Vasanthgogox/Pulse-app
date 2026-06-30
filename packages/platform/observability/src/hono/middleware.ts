import type { Context, Next } from 'hono';
import {
  createRequestContext,
  logRequestCompletion,
  type PlatformRequestContext,
} from '../context';
import { createStructuredLogger } from '../logger';
import { createRequestMetrics } from '../metrics';

export interface ObservabilityEnv {
  Variables: {
    reqCtx: PlatformRequestContext;
  };
}

export interface ObservabilityMiddlewareOptions {
  service: string;
}

export function observabilityMiddleware(options: ObservabilityMiddlewareOptions) {
  const logger = createStructuredLogger(options.service);
  const metrics = createRequestMetrics(options.service);

  return async (c: Context<ObservabilityEnv>, next: Next) => {
    const ctx = createRequestContext({
      service:       options.service,
      method:        c.req.method,
      endpoint:      c.req.path,
      requestId:     c.req.header('X-Request-Id'),
      correlationId: c.req.header('X-Correlation-Id'),
      logger,
      metrics,
    });
    c.set('reqCtx', ctx);

    await next();

    logRequestCompletion(ctx, c.res.status);
  };
}
