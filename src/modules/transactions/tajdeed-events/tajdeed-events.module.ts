import { Module } from '@nestjs/common';
import { TajdeedOutboxService } from './services/tajdeed-outbox.service';
import { TajdeedDispatcherService } from './services/tajdeed-dispatcher.service';
import { LaneStatusService } from './services/lane-status.service';
import { TajdeedEventsController } from './tajdeed-events.controller';

/**
 * Outbound events to the appointment provider: the durable outbox, the worker
 * that drains and reconciles it, and a read-only view of what we owe them.
 *
 * The outbox service is exported because the events it queues originate in
 * other modules (a submitted job, a lane changing state) — those callers must
 * be able to enqueue without depending on the dispatcher.
 */
@Module({
  controllers: [TajdeedEventsController],
  providers: [
    TajdeedOutboxService,
    TajdeedDispatcherService,
    LaneStatusService,
  ],
  exports: [TajdeedOutboxService, LaneStatusService],
})
export class TajdeedEventsModule {}
