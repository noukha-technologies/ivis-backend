import { CentreApiKey } from '../../database/entity/centre-api-key.entity';

export interface ICentreApiKeyDao {
  /** Persists a newly-minted key's hash for a centre — called once at onboarding-pull-complete. */
  createForCentre(centreId: string, keyHash: string): Promise<CentreApiKey>;

  /** All active (non-revoked) key rows — used by ApiKeyGuard to resolve a bearer token to a centre. */
  findAllActive(): Promise<CentreApiKey[]>;

  revoke(id: string): Promise<void>;
}
