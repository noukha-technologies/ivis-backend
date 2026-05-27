import { Module } from '@nestjs/common';
import { RolesModule } from './roles/roles.module';
import { VehicleModule } from './vehicles/vehicle.module';
import { TestModule } from './tests/test.module';
import { CentreModule } from './centres/centre.module';
import { LineModule } from './lines/line.module';
import { AdminPcModule } from './admin-pcs/admin-pc.module';
import { CameraModule } from './cameras/camera.module';
import { PaymentModule } from './payments/payment.module';

@Module({
  imports: [
    RolesModule,
    VehicleModule,
    TestModule,
    CentreModule,
    LineModule,
    AdminPcModule,
    CameraModule,
    PaymentModule,
  ],
  exports: [
    RolesModule,
    VehicleModule,
    TestModule,
    CentreModule,
    LineModule,
    AdminPcModule,
    CameraModule,
    PaymentModule,
  ],
})
export class MastersModule {}
