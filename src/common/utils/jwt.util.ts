import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import { ErrorException } from '../errors/custom-error.exception';

export type AccessTokenPayload = JwtPayload & {
  sub: string;
  jti: string;
  role: string;
  type?: 'access';
};

export type RefreshTokenPayload = JwtPayload & {
  sub: string;
  jti: string;
  type: 'refresh';
};

function assertPayload(
  payload: JwtPayload | string,
): asserts payload is JwtPayload {
  if (typeof payload === 'string' || !payload.sub || !payload.jti) {
    throw new ErrorException('INVALID_AUTHORISATION_TOKEN');
  }
}

export function signAccessToken(
  payload: { sub: string; jti: string; role: string },
  secret: string,
  expiresIn: string,
): string {
  const options: SignOptions = {
    subject: payload.sub,
    jwtid: payload.jti,
    expiresIn: expiresIn as SignOptions['expiresIn'],
  };
  return jwt.sign({ role: payload.role, type: 'access' }, secret, options);
}

export function signRefreshToken(
  payload: { sub: string; jti: string },
  secret: string,
  expiresIn: string,
): string {
  const options: SignOptions = {
    subject: payload.sub,
    jwtid: payload.jti,
    expiresIn: expiresIn as SignOptions['expiresIn'],
  };
  return jwt.sign({ type: 'refresh' }, secret, options);
}

export function verifyAccessToken(
  token: string,
  secret: string,
): AccessTokenPayload {
  try {
    const payload = jwt.verify(token, secret) as JwtPayload;
    assertPayload(payload);
    return payload as AccessTokenPayload;
  } catch {
    throw new ErrorException('INVALID_AUTHORISATION_TOKEN');
  }
}

export function verifyRefreshToken(
  token: string,
  secret: string,
): RefreshTokenPayload {
  try {
    const payload = jwt.verify(token, secret) as JwtPayload;
    if (payload.type !== 'refresh') {
      throw new ErrorException('INVALID_AUTHORISATION_TOKEN');
    }
    assertPayload(payload);
    return payload as RefreshTokenPayload;
  } catch (error) {
    if (error instanceof ErrorException) {
      throw error;
    }
    throw new ErrorException('INVALID_AUTHORISATION_TOKEN');
  }
}

export function signResetToken(
  subject: string,
  secret: string,
  expiresIn: string,
): string {
  const options: SignOptions = {
    subject,
    expiresIn: expiresIn as SignOptions['expiresIn'],
  };
  return jwt.sign({}, secret, options);
}

export function verifyResetToken(
  token: string,
  secret: string,
  subject: string,
): JwtPayload {
  try {
    return jwt.verify(token, secret, { subject }) as JwtPayload;
  } catch (error: unknown) {
    if (
      error instanceof jwt.TokenExpiredError ||
      error instanceof jwt.JsonWebTokenError ||
      error instanceof jwt.NotBeforeError
    ) {
      throw new ErrorException('INVALID_RESET_TOKEN');
    }
    throw new ErrorException(
      'SOMETHING_WENT_WRONG',
      'Reset token validation failed',
    );
  }
}
