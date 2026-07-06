import { Module } from '@nestjs/common';
import { OnboardingService } from './service/onboarding.service';
import { CentralSyncReaderService } from './service/central-sync-reader.service';

// No controller — Onboarding Sync is triggered only from AuthService.login(),
// never its own HTTP route. OnboardingStatusDao is registered (and exported)
// by DatabaseModule (@Global()), same as every other DAO.
@Module({
  providers: [OnboardingService, CentralSyncReaderService],
  exports: [OnboardingService],
})
export class OnboardingModule {}
