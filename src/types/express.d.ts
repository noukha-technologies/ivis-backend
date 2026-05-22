import { UserContext } from '../common/dto/auth.dto.js';

declare global {
  namespace Express {
    interface Request {
      user?: UserContext;
    }
  }
}

export {};
