import { Module } from '@nestjs/common';
import { RolesModule } from './roles/roles.module';
import { VehicleModule } from './vehicles/vehicle.module';
import { TestModule } from './tests/test.module';
import { CentreModule } from './centres/centre.module';
import { LineModule } from './lines/line.module';

@Module({
  imports: [RolesModule, VehicleModule, TestModule, CentreModule, LineModule],
  exports: [RolesModule, VehicleModule, TestModule, CentreModule, LineModule],
})
export class MastersModule {}
