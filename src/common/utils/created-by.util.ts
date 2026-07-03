import type { UserContext } from '../dto/auth.dto';
import { ErrorException } from '../errors/custom-error.exception';

/**
 * Returns the authenticated user's snowflake id for audit columns (created_by).
 * Never trust client-supplied created_by on create — use this from @CurrentUser().
 */
export function getCreatedById(actor: UserContext): string {
  const id = actor.user.id?.trim();
  if (!id) {
    throw new ErrorException(
      'FORBIDDEN_REQUEST',
      'Authenticated user is required',
    );
  }
  return id;
}
