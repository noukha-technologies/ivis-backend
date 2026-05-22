import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Custom application exception with standardized error response format.
 */
export class CustomException extends HttpException {
  constructor(
    message: string,
    statusCode: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR,
    error?: string,
  ) {
    super(
      {
        success: false,
        message,
        error: error || 'Error',
      },
      statusCode,
    );
  }
}

/**
 * Thrown when a resource already exists (e.g., duplicate email or user_id).
 */
export class DuplicateResourceException extends CustomException {
  constructor(resource: string, field: string, value: string | number) {
    super(
      `${resource} with ${field} '${value}' already exists`,
      HttpStatus.CONFLICT,
      'Conflict',
    );
  }
}

/**
 * Thrown when a requested resource is not found.
 */
export class ResourceNotFoundException extends CustomException {
  constructor(resource: string, identifier: string | number) {
    super(
      `${resource} with identifier '${identifier}' not found`,
      HttpStatus.NOT_FOUND,
      'Not Found',
    );
  }
}

/**
 * Thrown when a database operation fails.
 */
export class DatabaseException extends CustomException {
  constructor(message: string = 'A database error occurred') {
    super(message, HttpStatus.INTERNAL_SERVER_ERROR, 'Database Error');
  }
}
