import { Module } from '@nestjs/common';
import { VehicleModule } from './vehicles/vehicle.module';
import { TestModule } from './tests/test.module';
import { CentreModule } from './centres/centre.module';
import { LineModule } from './lines/line.module';
import { AdminPcModule } from './admin-pcs/admin-pc.module';
import { CameraModule } from './cameras/camera.module';
import { ChargeModule } from './charges/charge.module';
import { PaymentTypeModule } from './payment-type/payment-type.module';

@Module({
  imports: [
    VehicleModule,
    TestModule,
    CentreModule,
    LineModule,
    AdminPcModule,
    CameraModule,
    ChargeModule,
    PaymentTypeModule,
  ],
  exports: [
    VehicleModule,
    TestModule,
    CentreModule,
    LineModule,
    AdminPcModule,
    CameraModule,
    ChargeModule,
    PaymentTypeModule,
  ],
})
export class MastersModule { }
