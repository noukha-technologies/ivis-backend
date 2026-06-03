import { Module } from '@nestjs/common';
import { VehicleModule } from './vehicles/vehicle.module';
import { CentreModule } from './centres/centre.module';
import { LineModule } from './lines/line.module';
import { AdminPcModule } from './admin-pcs/admin-pc.module';
import { CameraModule } from './cameras/camera.module';
import { PaymentModule } from './payments/payment.module';

@Module({
  imports: [
    VehicleModule,
    CentreModule,
    LineModule,
    AdminPcModule,
    CameraModule,
    PaymentModule,
  ],
  exports: [
    VehicleModule,
    CentreModule,
    LineModule,
    AdminPcModule,
    CameraModule,
    PaymentModule,
  ],
})
export class MastersModule { }
