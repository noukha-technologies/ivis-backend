import { Module } from '@nestjs/common';
import { OnboardingService } from './service/onboarding.service';
import { OnboardingController } from './onboarding.controller';
import { OnboardingCentralService } from './service/onboarding-central.service';
import { CentralOnboardingHttpClientService } from './service/central-onboarding-http-client.service';

// OnboardingController is the central-side HTTPS surface (confirm/verify-
// central/pull/complete) — see Database_sync_arch_replan.md §5.
// OnboardingService (centre-side) and OnboardingCentralService (central-
// side) both live in this one module since only one role runs at a time on
// a given deployment (NODE_ROLE), same as the rest of this app's shape.
// CentralOnboardingHttpClientService is exported so AuthModule's AuthService
// (imports OnboardingModule) can also call verify-central/resolve-rescoped-
// row directly, not just through OnboardingService.
// OnboardingStatusDao is registered (and exported) by DatabaseModule
// (@Global()), same as every other DAO.
@Module({
  controllers: [OnboardingController],
  providers: [
    OnboardingService,
    OnboardingCentralService,
    CentralOnboardingHttpClientService,
  ],
  exports: [OnboardingService, CentralOnboardingHttpClientService],
})
export class OnboardingModule {}
