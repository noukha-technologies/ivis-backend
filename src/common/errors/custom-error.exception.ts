import { HttpException } from '@nestjs/common';
import { errorRecord } from './error-handler';

type ErrorKey = keyof typeof errorRecord;

export class ErrorException extends HttpException {
  constructor(
    exceptionKey?: ErrorKey,
    customMessage?: string,
    customErrorCode?: number,
  ) {
    const errorRecordEntry = exceptionKey ? errorRecord[exceptionKey] : null;
    const {
      statusCode = 500,
      message = 'An error occurred',
      errorCode = exceptionKey,
    } = errorRecordEntry || {};

    const finalStatusCode = customErrorCode ?? statusCode;
    const finalMessage = customMessage || message;

    super({ errorCode, message: finalMessage }, finalStatusCode);
  }
}
