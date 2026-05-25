import { Module } from '@nestjs/common';
import { RolesModule } from './roles/roles.module';
import { VehicleModule } from './vehicles/vehicle.module';

@Module({
  imports: [RolesModule, VehicleModule],
  exports: [RolesModule, VehicleModule],
})
export class MastersModule {}
