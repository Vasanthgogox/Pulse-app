# @pulse/platform-observability

Shared platform telemetry — not UI. Every service (Gateway, Identity, Commerce, Planning, Execution, Finance) emits identical structured logs.

## Usage

```typescript
import { observabilityMiddleware, createRequestContext } from '@pulse/platform-observability';

app.use('*', observabilityMiddleware({ service: 'identity' }));
```

Each request produces structured JSON:

```json
{
  "event": "http.request",
  "requestId": "...",
  "correlationId": "...",
  "tenantId": "...",
  "organizationId": "...",
  "membershipId": "...",
  "endpoint": "/auth/me",
  "method": "GET",
  "statusCode": 200,
  "durationMs": 42
}
```

No free-form log messages — fields only.
