import { isDevelopment } from './env.config';

const DEFAULT_DEV_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

export function getCorsOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS?.trim();
  if (!raw) {
    return DEFAULT_DEV_ORIGINS;
  }
  const configured = raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const merged = [...new Set([...DEFAULT_DEV_ORIGINS, ...configured])];
  return merged;
}

export function buildCorsOptions() {
  // Only local development gets the permissive any-origin policy. Staging is
  // a deployed environment reachable by others, so it uses the configured
  // allowlist exactly as production does.
  return {
    origin: isDevelopment() ? true : getCorsOrigins(),
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'user-current-view'],
  };
}
