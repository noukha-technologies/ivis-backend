import { registerAs } from '@nestjs/config';

export interface AppConfig {
  nodeEnv: string;
  port: number;
  apiPrefix: string;
  corsOrigins: string[];
}

export default registerAs('app', (): AppConfig => {
  const originsEnv = process.env.CORS_ORIGINS || '';
  const corsOrigins = originsEnv
    ? originsEnv.split(',').map((origin) => origin.trim())
    : ['*'];

  return {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3000', 10),
    apiPrefix: process.env.API_PREFIX || 'api',
    corsOrigins,
  };
});
