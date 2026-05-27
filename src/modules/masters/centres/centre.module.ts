import { Module } from '@nestjs/common';
import { CentreController } from './centre.controller';
import { CentreService } from './services/centre.service';

@Module({
  controllers: [CentreController],
  providers: [CentreService],
  exports: [CentreService],
})
export class CentreModule {}
