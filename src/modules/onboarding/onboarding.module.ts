import { Module } from '@nestjs/common';
import { OnboardingService } from './service/onboarding.service';
import { CentralSyncReaderService } from './service/central-sync-reader.service';

// No controller — Onboarding Sync is triggered only from AuthService.login(),
// never its own HTTP route. OnboardingStatusDao is registered (and exported)
// by DatabaseModule (@Global()), same as every other DAO.
@Module({
  providers: [OnboardingService, CentralSyncReaderService],
  // CentralSyncReaderService is also exported — Database Sync's pull phase
  // (modules/sync/**) reuses this same read-only reader/connection rather
  // than duplicating a second one.
  exports: [OnboardingService, CentralSyncReaderService],
})
export class OnboardingModule {}
