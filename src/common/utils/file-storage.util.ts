import { mkdir, writeFile } from 'fs/promises';
import { randomBytes } from 'crypto';
import * as path from 'path';
import { BadRequestException } from '@nestjs/common';

export interface SavedFileResult {
  relativePath: string;
  absolutePath: string;
}

export function getUploadRoot(): string {
  return process.env.UPLOAD_ROOT ?? path.join(process.cwd(), 'uploads');
}

function parseBase64Payload(input: string): {
  buffer: Buffer;
  extension: string;
} {
  const dataUrlMatch = /^data:([^;]+);base64,(.+)$/i.exec(input.trim());
  if (dataUrlMatch) {
    const mimeType = dataUrlMatch[1].toLowerCase();
    const base64Data = dataUrlMatch[2];
    const extension = mimeTypeToExtension(mimeType);
    return { buffer: Buffer.from(base64Data, 'base64'), extension };
  }

  return { buffer: Buffer.from(input.trim(), 'base64'), extension: 'bin' };
}

function mimeTypeToExtension(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'application/pdf': 'pdf',
  };
  return map[mimeType] ?? 'bin';
}

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
}

export function isExternalFileUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

export async function saveBase64File(
  input: string,
  subdirectory: string,
  filenameHint?: string,
): Promise<SavedFileResult> {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new BadRequestException('File content is empty.');
  }

  if (isExternalFileUrl(trimmed)) {
    return { relativePath: trimmed, absolutePath: trimmed };
  }

  let parsed: { buffer: Buffer; extension: string };
  try {
    parsed = parseBase64Payload(trimmed);
  } catch {
    throw new BadRequestException('Invalid base64 file content.');
  }

  if (!parsed.buffer.length) {
    throw new BadRequestException('Decoded file content is empty.');
  }

  const baseName = filenameHint
    ? sanitizeFilename(path.parse(filenameHint).name)
    : randomBytes(8).toString('hex');
  const extension = filenameHint
    ? sanitizeFilename(
        path.extname(filenameHint).replace(/^\./, '') || parsed.extension,
      )
    : parsed.extension;
  const filename = `${baseName}.${extension}`;
  const relativePath = path.posix.join(subdirectory, filename);
  const absolutePath = path.join(getUploadRoot(), relativePath);

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, parsed.buffer);

  return { relativePath, absolutePath };
}
