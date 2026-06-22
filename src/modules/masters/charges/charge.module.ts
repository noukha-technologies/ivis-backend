import { Module } from '@nestjs/common';
import { ChargeController } from './charge.controller';
import { ChargeService } from './services/charge.service';

@Module({
  controllers: [ChargeController],
  providers: [ChargeService],
  exports: [ChargeService],
})
export class ChargeModule {}
