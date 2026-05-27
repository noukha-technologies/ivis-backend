import { Module } from '@nestjs/common';
import { RolesModule } from './roles/roles.module';
import { VehicleModule } from './vehicles/vehicle.module';
import { TestModule } from './tests/test.module';
import { CentreModule } from './centres/centre.module';

@Module({
  imports: [RolesModule, VehicleModule, TestModule, CentreModule],
  exports: [RolesModule, VehicleModule, TestModule, CentreModule],
})
export class MastersModule {}
