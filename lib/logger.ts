type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const CURRENT_LEVEL: LogLevel = __DEV__ ? 'debug' : 'warn';

function shouldLog(level: LogLevel) {
  return LOG_LEVEL_ORDER[level] >= LOG_LEVEL_ORDER[CURRENT_LEVEL];
}

function format(message: string, context?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();

  if (context && Object.keys(context).length > 0) {
    return `[${timestamp}] ${message} | ${JSON.stringify(context)}`;
  }

  return `[${timestamp}] ${message}`;
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => {
    if (!shouldLog('debug')) return;
    // eslint-disable-next-line no-console
    console.debug(format(message, context));
  },
  info: (message: string, context?: Record<string, unknown>) => {
    if (!shouldLog('info')) return;
    // eslint-disable-next-line no-console
    console.info(format(message, context));
  },
  warn: (message: string, context?: Record<string, unknown>) => {
    if (!shouldLog('warn')) return;
    // eslint-disable-next-line no-console
    console.warn(format(message, context));
  },
  error: (message: string, context?: Record<string, unknown>) => {
    if (!shouldLog('error')) return;
    // eslint-disable-next-line no-console
    console.error(format(message, context));
  },
};

