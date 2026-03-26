/**
 * logger.ts – Structured JSON logger with secret redaction.
 *
 * SECURITY: Automatically redacts any string that matches a known secret
 * (API keys, tokens) from all log output.
 */

import { appConfig } from './config.js';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Collect all known secrets for redaction
const SECRETS_TO_REDACT: string[] = [
  appConfig.openRouterApiKey,
  appConfig.telegramBotToken ?? '',
  appConfig.supervisorToken ?? '',
].filter((s) => s.length > 0);

function redact(message: string): string {
  let redacted = message;
  for (const secret of SECRETS_TO_REDACT) {
    redacted = redacted.split(secret).join('[REDACTED]');
  }
  return redacted;
}

function emit(level: LogLevel, component: string, message: string, data?: Record<string, unknown>) {
  if (LOG_LEVELS[level] < LOG_LEVELS[appConfig.logLevel]) return;

  const entry = {
    ts: new Date().toISOString(),
    level,
    component,
    msg: redact(message),
    ...(data ? { data: JSON.parse(redact(JSON.stringify(data))) } : {}),
  };

  const output = JSON.stringify(entry);

  if (level === 'error') {
    process.stderr.write(output + '\n');
  } else {
    process.stdout.write(output + '\n');
  }
}

/**
 * Create a scoped logger for a specific component.
 *
 * @example
 * const log = createLogger('telegram');
 * log.info('Bot started');
 */
export function createLogger(component: string) {
  return {
    debug: (msg: string, data?: Record<string, unknown>) => emit('debug', component, msg, data),
    info: (msg: string, data?: Record<string, unknown>) => emit('info', component, msg, data),
    warn: (msg: string, data?: Record<string, unknown>) => emit('warn', component, msg, data),
    error: (msg: string, data?: Record<string, unknown>) => emit('error', component, msg, data),
  };
}
