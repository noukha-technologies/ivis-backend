import { customAlphabet } from 'nanoid';
import * as crypto from 'crypto';
import Bowser from 'bowser';
import { Request } from 'express';
import { ErrorException } from '../errors/custom-error.exception';
import { JWTPayload, jwtVerify, SignJWT } from 'jose';

export interface RequestMetata {
  browser: string;
  os: string;
  deviceType: string;
  ipAddress: string;
}

/**
 * Creates a custom nanoid generator with alphanumeric characters
 * @returns A function that generates a 10-character unique ID
 */
export const generateNanoid = customAlphabet(
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  16,
);

/**
 * Generates a unique ID using nanoid
 * @returns A 10-character unique ID
 */
export const generateUniqueId = (): string => {
  return generateNanoid();
};

export const generateOtp = (length = 6): string => {
  return Math.floor(Math.random() * Math.pow(10, length))
    .toString()
    .padStart(length, '0');
};

export const generateSecretHash = (
  username: string,
  clientId: string,
  clientSecret: string,
): string => {
  return crypto
    .createHmac('sha256', clientSecret)
    .update(username + clientId)
    .digest('base64');
};

/**
 * Generates a secure random password
 * @param length - Length of the password (default: 12)
 * @returns A secure random password
 */
export const generateRandomPassword = (length: number = 12): string => {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';

  const allChars = uppercase + lowercase + numbers + symbols;

  let password = '';

  // Ensure at least one character from each category
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += symbols[Math.floor(Math.random() * symbols.length)];

  // Fill the rest with random characters
  for (let i = 4; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }

  // Shuffle the password to avoid predictable patterns
  return password
    .split('')
    .sort(() => Math.random() - 0.5)
    .join('');
};

/**
 * Generates a password reset token
 * @returns A secure reset token
 */
export const generateResetToken = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

export function normalizeUserName(value: string): string {
  if (!value) return value;
  return value.trim().toLowerCase();
}

export const generateUniqueUserNameFromEmail = async (
  email: string,
  dbService: any,
  prefix: string = 'NA',
): Promise<string> => {
  const baseName = email.split('@')[0]; // get name from email
  let userName = '';
  let isUnique = false;

  while (!isUnique) {
    const randomNumber = Math.floor(1000 + Math.random() * 9000); // 4-digit random number
    userName = `${prefix}_${baseName}${randomNumber}`;

    // Check uniqueness in DB
    const existingUser = await dbService.adminUser.findOne({ userName });
    if (!existingUser) {
      isUnique = true;
    }
  }

  return userName;
};

export function getRequestMetadata(req: Request): RequestMetata {
  let ipAddress: string;
  const cf = req.headers['cloudfront-viewer-address'];
  const xff = req.headers['x-forwarded-for'];
  const remoteAddress = req.socket.remoteAddress;
  const ua =
    typeof req.headers['user-agent'] === 'string'
      ? req.headers['user-agent']
      : '';
  const parser = Bowser.getParser(ua);
  const browser = parser.getBrowserName() || 'unknown';
  const browserVersion = parser.getBrowserVersion() ?? '';
  const os = parser.getOSName() || 'unknown';
  const osVersion = parser.getOSVersion() || '';
  const deviceType = parser.getPlatformType() || 'desktop';
  console.log({
    browser,
    browserVersion,
    os,
    osVersion,
    deviceType,
    ip: req.ip,
    remoteAddress: remoteAddress,
    xForwardedFor: xff,
    cloudfront: cf,
  });
  if (cf) {
    ipAddress = cf.toString().split(':')[0];
  } else if (xff) {
    const ips = xff
      .toString()
      .split(',')
      .map((ip) => ip.trim());
    ipAddress = ips[ips.length - 1]; // LAST IP = added by ALB
  } else if (remoteAddress) {
    ipAddress = remoteAddress;
  } else {
    ipAddress = req.ip ?? 'unknown';
  }
  return {
    browser: `${browser} - ${browserVersion}`,
    os: `${os} - ${osVersion}`,
    deviceType,
    ipAddress,
  };
}

// --- Encrypt ---
export function encrypt(data: string, key: Buffer): string {
  try {
    const iv = crypto.randomBytes(12); // 12 bytes recommended for GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    const encrypted = Buffer.concat([
      cipher.update(data, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    // Store: IV + AuthTag + Ciphertext
    const stored = Buffer.concat([iv, authTag, encrypted]).toString('base64');
    return stored;
  } catch (error) {
    console.error(`Failed to encrypt due to: `, error);
    throw new ErrorException('SOMETHING_WENT_WRONG', 'Encryption failed');
  }
}

// --- Decrypt ---
export function decrypt(storedData: string, key: Buffer): string {
  try {
    const data = Buffer.from(storedData, 'base64');

    const iv = data.slice(0, 12); // first 12 bytes = IV
    const authTag = data.slice(12, 28); // next 16 bytes = auth tag
    const encrypted = data.slice(28); // rest = ciphertext

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString('utf8');
    return decrypted;
  } catch (error) {
    console.error(`Failed to decrypt due to: `, error);
    throw new ErrorException('SOMETHING_WENT_WRONG', 'Decryption failed');
  }
}

export async function createJwt(
  subject: string,
  expirationTime: string,
  secret: string,
  payload?: JWTPayload,
): Promise<string> {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(subject)
    .setIssuedAt()
    .setExpirationTime(expirationTime)
    .sign(new TextEncoder().encode(secret));
}

export async function verifyJwt(
  jwt: string,
  secret: string,
  subject: string,
): Promise<JWTPayload> {
  const { payload } = await jwtVerify(jwt, new TextEncoder().encode(secret), {
    subject,
  });
  return payload;
}

export function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// IANA identifier for Oman's timezone (UTC+4, no DST) — the single source of
// truth used app-wide (backend + frontend) so "today"/"now" always means the
// same wall-clock day, regardless of which host timezone the server runs in.
export const OmanTimeZone = 'Asia/Muscat';

/**
 * Whether two instants fall on the same Oman calendar day.
 *
 * Business rules here are written in Oman wall-clock terms — ROP wants the
 * result submitted on the day the job was raised, and the provider only keeps
 * a booking actionable for its own day — so "same day" must be evaluated in
 * Asia/Muscat, never in the host's timezone.
 */
export function isSameOmanDay(a: Date, b: Date): boolean {
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: OmanTimeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  return fmt(a) === fmt(b);
}

export function getDateFolder(): string {
  const [yyyy, mm, dd] = new Intl.DateTimeFormat('en-CA', {
    timeZone: OmanTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(new Date())
    .split('-');

  return `${yyyy}${mm}${dd}`; // yyyymmdd, Oman calendar day
}
