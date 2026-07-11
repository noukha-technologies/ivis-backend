import type { UserContext } from '../common/dto/auth.dto';

declare global {
  namespace Express {
    interface Request {
      user?: UserContext;
      /** Set by ApiKeyGuard — the authenticated centre's id, for /sync/** machine-to-machine routes. */
      centreId?: string;
    }
  }
}

export {};
