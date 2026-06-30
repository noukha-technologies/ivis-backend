import { Global, Module } from '@nestjs/common';
import { RopApiClientService } from './rop/rop-api-client.service';
import { OnlineAppointmentApiClientService } from './online-appointment/online-appointment-api-client.service';
import { PaymentApiClientService } from './payment/payment-api-client.service';

@Global()
@Module({
  providers: [RopApiClientService, OnlineAppointmentApiClientService, PaymentApiClientService],
  exports: [RopApiClientService, OnlineAppointmentApiClientService, PaymentApiClientService],
})
export class IntegrationsModule {}
