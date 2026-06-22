import { Module } from '@nestjs/common';
import { VehicleModule } from './vehicles/vehicle.module';
import { TestModule } from './tests/test.module';
import { CentreModule } from './centres/centre.module';
import { LineModule } from './lines/line.module';
import { AdminPcModule } from './admin-pcs/admin-pc.module';
import { CameraModule } from './cameras/camera.module';
import { PaymentModule } from './payments/payment.module';
import { ChargeModule } from './charges/charge.module';

@Module({
  imports: [
    VehicleModule,
    TestModule,
    CentreModule,
    LineModule,
    AdminPcModule,
    CameraModule,
    PaymentModule,
    ChargeModule,
  ],
  exports: [
    VehicleModule,
    TestModule,
    CentreModule,
    LineModule,
    AdminPcModule,
    CameraModule,
    PaymentModule,
    ChargeModule,
  ],
})
export class MastersModule { }
