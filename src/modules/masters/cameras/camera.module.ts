import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CameraController } from './camera.controller.js';
import { CameraService } from './services/camera.service.js';
import { CameraHealthCheckService } from './services/camera-health-check.service.js';
import { CameraHealthCheckSchedulerService } from './services/camera-health-check-scheduler.service.js';

@Module({
  imports: [ScheduleModule],
  controllers: [CameraController],
  providers: [CameraService, CameraHealthCheckService, CameraHealthCheckSchedulerService],
  exports: [CameraService, CameraHealthCheckService],
})
export class CameraModule {}
