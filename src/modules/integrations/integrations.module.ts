import { Global, Module } from '@nestjs/common';
import { RopApiClientService } from './rop/rop-api-client.service';
import { OnlineAppointmentApiClientService } from './online-appointment/online-appointment-api-client.service';

@Global()
@Module({
  providers: [RopApiClientService, OnlineAppointmentApiClientService],
  exports: [RopApiClientService, OnlineAppointmentApiClientService],
})
export class IntegrationsModule {}
