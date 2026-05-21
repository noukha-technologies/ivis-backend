import { registerAs } from '@nestjs/config';

export default registerAs('swagger', () => ({
  title: 'IVIS API Documentation',
  description: 'Production-ready APIs for IVIS Backend Application.',
  version: '1.0',
  path: 'api/docs',
}));
