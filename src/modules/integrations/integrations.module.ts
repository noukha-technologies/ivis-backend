import { Global, Module } from '@nestjs/common';
import { RopApiClientService } from './rop/rop-api-client.service';

@Global()
@Module({
  providers: [RopApiClientService],
  exports: [RopApiClientService],
})
export class IntegrationsModule {}
