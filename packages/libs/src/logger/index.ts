import winston from 'winston';
export type { Logger } from 'winston';

type LoggerProps = {
  target: 'server' | 'browser';
};

export const getLogger = ({ target }: LoggerProps) => {
  const logFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
    winston.format.errors({ stack: true })
  );

  const logger = winston.createLogger({
    level: 'info',
    format: logFormat,
    defaultMeta: {
      service: target,
      environment: process.env.NODE_ENV,
    },
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        ),
      }),
    ],
  });

  return logger;
};
