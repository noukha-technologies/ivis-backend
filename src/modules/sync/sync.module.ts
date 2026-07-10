import { Module } from '@nestjs/common';
import { OnboardingModule } from '../onboarding/onboarding.module';
import { SyncController } from './sync.controller';
import { DatabaseSyncService } from './service/database-sync.service';
import { DatabaseSyncSchedulerService } from './service/database-sync-scheduler.service';
import { CentralSyncWriterService } from './service/central-sync-writer.service';

// Database Sync (ongoing, bidirectional) — separate system from Onboarding
// Sync (modules/onboarding/**, untouched by this module). Reuses
// OnboardingModule's CentralSyncReaderService for the pull phase's
// read-only queries; owns its own writable central connection
// (CentralSyncWriterService) for the push phase. SyncStateDao,
// OnboardingStatusDao, ConfigurationDao are registered by DatabaseModule
// (@Global()), same as every other DAO.
@Module({
  imports: [OnboardingModule],
  controllers: [SyncController],
  providers: [
    DatabaseSyncService,
    DatabaseSyncSchedulerService,
    CentralSyncWriterService,
  ],
  exports: [DatabaseSyncService],
})
export class SyncModule {}
