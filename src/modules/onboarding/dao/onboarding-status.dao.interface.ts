import { OnboardingStatus } from '../../database/entity/onboarding-status.entity';
import { OnboardingStatusValue } from '../../../common/enums/onboarding.enums';

export interface IOnboardingStatusDao {
  /** Returns the single status row, creating it (as PENDING) if it doesn't exist yet. */
  ensureSingletonRow(): Promise<OnboardingStatus>;

  getStatus(): Promise<OnboardingStatus | null>;

  /**
   * Atomic conditional transition: only succeeds if the row's current status
   * is one of `fromStatuses`. Returns false (no-op) if another request already
   * moved the state — the caller re-reads and reacts, never overwrites blindly.
   */
  tryClaim(
    id: string,
    fromStatuses: OnboardingStatusValue[],
    toStatus: OnboardingStatusValue,
    extra?: Partial<OnboardingStatus>,
  ): Promise<boolean>;

  markFailed(id: string, error: string): Promise<void>;
}
