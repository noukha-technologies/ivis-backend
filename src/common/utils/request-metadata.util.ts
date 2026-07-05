import { Request } from 'express';

export interface RequestMetadata {
  browser: string;
  os: string;
  deviceType: string;
  ipAddress: string;
}

export function getRequestMetadata(req: Request): RequestMetadata {
  const xff = req.headers['x-forwarded-for'];
  const remoteAddress = req.socket.remoteAddress;
  let ipAddress: string;

  if (xff) {
    const ips = xff
      .toString()
      .split(',')
      .map((ip) => ip.trim());
    ipAddress = ips[ips.length - 1] ?? req.ip;
  } else if (remoteAddress) {
    ipAddress = remoteAddress;
  } else {
    ipAddress = req.ip ?? 'unknown';
  }

  const ua =
    typeof req.headers['user-agent'] === 'string'
      ? req.headers['user-agent']
      : '';

  return {
    browser: ua || 'unknown',
    os: 'unknown',
    deviceType: 'unknown',
    ipAddress,
  };
}
