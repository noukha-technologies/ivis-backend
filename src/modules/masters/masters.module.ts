import { Module } from '@nestjs/common';
import { RolesModule } from './roles/roles.module';
import { VehicleModule } from './vehicles/vehicle.module';
import { TestModule } from './tests/test.module';

@Module({
  imports: [RolesModule, VehicleModule, TestModule],
  exports: [RolesModule, VehicleModule, TestModule],
})
export class MastersModule {}
