import { UserContext } from '../common/dto/auth.dto';

declare global {
  namespace Express {
    interface Request {
      user?: UserContext;
    }
  }
}

export {};
