import pino from 'pino';

const isDev = process.env.NODE_ENV === 'development';

const pinoConfig = {
  level: process.env.LOG_LEVEL || 'info',
  timestamp: pino.stdTimeFunctions.isoTime,
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
};

export const logger = pino(pinoConfig);

export function createLogger(name: string) {
  return logger.child({ module: name });
}

export type Logger = ReturnType<typeof createLogger>;
