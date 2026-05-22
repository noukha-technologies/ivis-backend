import { HttpStatus } from '@nestjs/common';
import { ErrorDetails } from '../interfaces/common.interfaces';

export const ERROR_CODES: Record<string, ErrorDetails> = {
    SOMETHING_WENT_WRONG: {
        code: '001',
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Something went wrong, please try again.',
    },
    PROBLEM_WITH_REQUEST_PAYLOAD_INVALID_STRING: {
        code: '002',
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Problem with the request payload - Invalid String.',
    },
    NOT_FOUND: {
        code: '003',
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Request Record is not found',
    },
    AUTHENTICATION_FAILURE: {
        code: '004',
        statusCode: HttpStatus.UNAUTHORIZED,
        message: 'Authentication Failed',
    },
    INVALID_OTP: {
        code: '005',
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Invalid or expired OTP',
    },
    INVALID_AUTHORISATION_TOKEN: {
        code: '007',
        statusCode: HttpStatus.UNAUTHORIZED,
        message: 'Invalid Authorisation token.',
    },
    REFERRAL_CODE_EXISTS: {
        code: '101',
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'You already have a referral code associated with your account. Please use the existing code or try a different one.',
    },
    SUBSCRIPTION_EXISTS: {
        code: '101',
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'You already have an active subscription. Referral codes can only be applied if you don\'t have an active subscription.',
    },
    USER_EXISTS_AWS_COGNITO_EXCEPTION: {
        code: '008',
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'AWS User Already Exists'
    },
    FORBIDDEN_REQUEST: {
        code: '009',
        statusCode: HttpStatus.FORBIDDEN,
        message: 'Forbidden Request'
    },
    WEAK_PASSWORD: {
        code: '010',
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Password does not meet security requirements.'
    },
    PASSWORD_REUSED: {
        code: '011',
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'You cannot reuse a previous password. Please choose a new password.'
    },
    INVALID_RESET_TOKEN: {
        code: '012',
        statusCode: HttpStatus.UNAUTHORIZED,
        message: 'Invalid or expired reset token'
    },
    DUPLICATE_RECORD: {
        code: '013',
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Duplicate Records'
    },
    INVALID_USER: {
        code: '014',
        statusCode: HttpStatus.UNAUTHORIZED,
        message: 'Invalid username or password'
    },
    INVALID_LOGIN_METHOD: {
        code: '015',
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Invalid Login Method'
    },
    BAD_REQUEST: {
        code: '016',
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Invalid Payload'
    }
};

export const ERROR_CODE_PREFIX = 'US';

