import * as crypto from 'crypto';
import { ErrorException } from '../errors/custom-error.exception';

export function encrypt(data: string, key: Buffer): string {
  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([
      cipher.update(data, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, encrypted]).toString('base64');
  } catch {
    throw new ErrorException('SOMETHING_WENT_WRONG', 'Encryption failed');
  }
}

export function decrypt(storedData: string, key: Buffer): string {
  try {
    const data = Buffer.from(storedData, 'base64');
    const iv = data.subarray(0, 12);
    const authTag = data.subarray(12, 28);
    const encrypted = data.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new ErrorException('SOMETHING_WENT_WRONG', 'Decryption failed');
  }
}

export function hashRefreshTokenKey(secret: string): Buffer {
  return crypto.createHash('sha256').update(secret).digest();
}
