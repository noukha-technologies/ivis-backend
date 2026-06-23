import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Welcome to IVIS Backend! Server is Live 📈';
  }
}
