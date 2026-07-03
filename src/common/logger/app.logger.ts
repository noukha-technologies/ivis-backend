import { Injectable, LoggerService } from '@nestjs/common';
import chalk from 'chalk';

type LogLevel = 'LOG' | 'ERROR' | 'WARN' | 'DEBUG' | 'VERBOSE';

const levelStyles: Record<LogLevel, (text: string) => string> = {
  LOG: chalk.green.bold,
  ERROR: chalk.red.bold,
  WARN: chalk.yellow.bold,
  DEBUG: chalk.blue.bold,
  VERBOSE: chalk.cyan.bold,
};

const contextStyles: Record<string, (text: string) => string> = {
  API: chalk.magenta.bold,
  Bootstrap: chalk.cyan,
  CORS: chalk.yellow,
};

@Injectable()
export class AppLogger implements LoggerService {
  private formatContext(context?: string): string {
    if (!context) return '';
    const style = contextStyles[context] ?? chalk.white;
    return style(` [${context}]`);
  }

  private print(level: LogLevel, message: unknown, context?: string): void {
    const timestamp = chalk.gray(new Date().toISOString());
    const levelLabel = levelStyles[level](`[${level}]`);
    const ctx = this.formatContext(context);
    const text =
      typeof message === 'string' ? message : JSON.stringify(message);

    const output = `${chalk.gray('[')}${timestamp}${chalk.gray(']')} ${levelLabel}${ctx} ${text}`;

    if (level === 'ERROR') {
      console.error(output);
    } else {
      console.log(output);
    }
  }

  log(message: unknown, context?: string): void {
    this.print('LOG', message, context);
  }

  error(message: unknown, trace?: string, context?: string): void {
    this.print('ERROR', message, context);
    if (trace) {
      console.error(chalk.red(trace));
    }
  }

  warn(message: unknown, context?: string): void {
    this.print('WARN', message, context);
  }

  debug(message: unknown, context?: string): void {
    this.print('DEBUG', message, context);
  }

  verbose(message: unknown, context?: string): void {
    this.print('VERBOSE', message, context);
  }

  /** Colored API request log (used by LoggerMiddleware). */
  apiRequest(method: string, url: string): void {
    const timestamp = chalk.gray(new Date().toISOString());
    const methodLabel = chalk.bold.cyan(method.padEnd(7));
    console.log(
      `${chalk.gray('[')}${timestamp}${chalk.gray(']')} ${chalk.magenta.bold('[API]')} ${chalk.green('-->')} ${methodLabel} ${chalk.white(url)}`,
    );
  }

  /** Colored API response log with status-based color. */
  apiResponse(
    method: string,
    url: string,
    statusCode: number,
    ms: number,
  ): void {
    const timestamp = chalk.gray(new Date().toISOString());
    const methodLabel = chalk.bold.cyan(method.padEnd(7));
    const statusLabel = this.colorStatus(statusCode)(String(statusCode));
    const timeLabel =
      ms < 200
        ? chalk.green(`${ms}ms`)
        : ms < 1000
          ? chalk.yellow(`${ms}ms`)
          : chalk.red(`${ms}ms`);

    console.log(
      `${chalk.gray('[')}${timestamp}${chalk.gray(']')} ${chalk.magenta.bold('[API]')} ${chalk.green('<--')} ${methodLabel} ${chalk.white(url)} ${statusLabel} ${timeLabel}`,
    );
  }

  private colorStatus(statusCode: number): (text: string) => string {
    if (statusCode >= 500) return chalk.red.bold;
    if (statusCode >= 400) return chalk.yellow.bold;
    if (statusCode >= 300) return chalk.cyan.bold;
    return chalk.green.bold;
  }
}
