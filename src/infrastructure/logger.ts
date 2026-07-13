// Root Pino logger. Fastify wraps this to produce per-request child loggers
// (see request-context.ts), so this is the one place that decides format:
// pretty-printed in development, structured JSON in production (JSON is what
// a log aggregator like Loki/ELK actually wants).
import pino from 'pino';
import { config, isProduction } from '../config/index.js';

export function createLogger(): pino.Logger {
  return pino({
    level: config.LOG_LEVEL,
    transport: isProduction
      ? undefined
      : {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        },
  });
}
