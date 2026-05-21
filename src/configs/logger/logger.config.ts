import { format, transports } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

export const winstonConfig = {
  transports: [
    new transports.Console({
      format: format.combine(
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        format.colorize({ all: true }),
        format.printf(
          (info) =>
            `[${info.timestamp}] [${info.level}] [${info.context || 'Application'}]: ${info.message}`,
        ),
      ),
    }),
    new DailyRotateFile({
      dirname: 'logs',
      filename: 'application-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
      format: format.combine(
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        format.json(),
      ),
    }),
  ],
};
