import { Module } from '@nestjs/common';
import { CameraController } from './camera.controller';
import { CameraService } from './services/camera.service';

@Module({
  controllers: [CameraController],
  providers: [CameraService],
  exports: [CameraService],
})
export class CameraModule {}
