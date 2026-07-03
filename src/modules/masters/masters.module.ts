import { Module } from '@nestjs/common';
import { TestModule } from './tests/test.module';
import { LineModule } from './lines/line.module';
import { CameraModule } from './cameras/camera.module';
import { ChargeModule } from './charges/charge.module';
import { CentreModule } from './centres/centre.module';
import { VehicleModule } from './vehicles/vehicle.module';
import { AdminPcModule } from './admin-pcs/admin-pc.module';
import { PaymentTypeModule } from './payment-type/payment-type.module';
import { ChargeCategoryModule } from './charge-categories/charge-category.module';

@Module({
  imports: [
    VehicleModule,
    TestModule,
    CentreModule,
    LineModule,
    AdminPcModule,
    CameraModule,
    ChargeModule,
    ChargeCategoryModule,
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
    ChargeCategoryModule,
    PaymentTypeModule,
  ],
})
export class MastersModule {}
