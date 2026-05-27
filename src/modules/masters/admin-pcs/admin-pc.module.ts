import { Module } from '@nestjs/common';
import { AdminPcController } from './admin-pc.controller';
import { AdminPcService } from './services/admin-pc.service';

@Module({
  controllers: [AdminPcController],
  providers: [AdminPcService],
  exports: [AdminPcService],
})
export class AdminPcModule {}
