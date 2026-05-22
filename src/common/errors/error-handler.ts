import { ERROR_CODE_PREFIX, ERROR_CODES } from "../constants/error-codes.config";

const generateErrorCode = (code: string, statusCode: number): string =>
    `${ERROR_CODE_PREFIX}${statusCode}${code}`;

export const errorRecord: Record<string, { errorCode: string; statusCode: number; message: string }> =
  Object.keys(ERROR_CODES).reduce(
    (acc, key) => {
      const { code, statusCode, message } = ERROR_CODES[key as keyof typeof ERROR_CODES];
      acc[key] = {
        errorCode: generateErrorCode(code, statusCode),
        statusCode,
        message,
      };
      return acc;
    },
    {} as Record<string, { errorCode: string; statusCode: number; message: string }>,
  );

export const ERROR_RECORDS = errorRecord;

