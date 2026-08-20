import { Module } from '@nestjs/common';

import { SyncController } from './sync.controller';
import { SyncCentralService } from './service/sync-central.service';
import { DatabaseSyncService } from './service/database-sync.service';
import { CentralSyncHttpClientService } from './service/central-sync-http-client.service';
import { SyncSchedulerService } from './service/sync-scheduler.service';
import { ApiKeyGuard } from './guards/api-key.guard';
import { SyncGateway } from './sync.gateway';

// HTTPS-only Database Sync (see Database_sync_arch_replan.md). No
// OnboardingModule import — every provider here depends only on the local
// DataSource + DAOs (all @Global() from DatabaseModule) and plain HTTP
// (CentralSyncHttpClientService), not on anything Onboarding-specific.
@Module({
  controllers: [SyncController],
  providers: [
    SyncCentralService,
    DatabaseSyncService,
    CentralSyncHttpClientService,
    SyncSchedulerService,
    ApiKeyGuard,
    SyncGateway,
  ],
})
export class SyncModule {}
