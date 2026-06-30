export interface RequestMetrics {
  recordRequest(fields: {
    endpoint:   string;
    method:     string;
    statusCode: number;
    durationMs: number;
  }): void;
}

/** In-process metrics stub — replace with Prometheus/Datadog exporter later. */
export function createRequestMetrics(service: string): RequestMetrics {
  return {
    recordRequest({ endpoint, method, statusCode, durationMs }) {
      // Structured metric line for log aggregators until a real exporter ships.
      console.log(JSON.stringify({
        level:      'info',
        event:      'metric.http.request',
        service,
        timestamp:  new Date().toISOString(),
        endpoint,
        method,
        statusCode,
        durationMs,
      }));
    },
  };
}
