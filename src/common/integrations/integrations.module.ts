import { Global, Module } from '@nestjs/common';
import { RopApiClientService } from './rop/rop-api-client.service';
import { PaymentApiClientService } from './payment/payment-api-client.service';
import { AppointmentApiClientService } from './appointments/appointment-api-client.service';
import { AppointmentBranchLinkService } from './appointments/appointment-branch-link.service';

@Global()
@Module({
  providers: [
    RopApiClientService,
    PaymentApiClientService,
    AppointmentApiClientService,
    AppointmentBranchLinkService,
  ],
  exports: [
    RopApiClientService,
    PaymentApiClientService,
    AppointmentApiClientService,
    AppointmentBranchLinkService,
  ],
})
export class IntegrationsModule {}
