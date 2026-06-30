export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface StructuredLogFields {
  event:          string;
  requestId?:     string;
  correlationId?: string;
  tenantId?:      string;
  organizationId?: string;
  membershipId?:  string;
  endpoint?:      string;
  method?:        string;
  statusCode?:    number;
  durationMs?:    number;
  service?:       string;
  [key: string]:  unknown;
}

export interface StructuredLogger {
  debug: (fields: StructuredLogFields) => void;
  info:  (fields: StructuredLogFields) => void;
  warn:  (fields: StructuredLogFields) => void;
  error: (fields: StructuredLogFields) => void;
}

export function createStructuredLogger(service: string): StructuredLogger {
  const write = (level: LogLevel, fields: StructuredLogFields) => {
    const line = JSON.stringify({
      level,
      service,
      timestamp: new Date().toISOString(),
      ...fields,
    });
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
  };

  return {
    debug: fields => write('debug', fields),
    info:  fields => write('info', fields),
    warn:  fields => write('warn', fields),
    error: fields => write('error', fields),
  };
}
