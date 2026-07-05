import { DeepPartial } from 'typeorm';
import { VehicleRecord } from '../entity/vehicle-record.entity';

export interface IVehicleRecordDao {
  create(entityLike: DeepPartial<VehicleRecord>): VehicleRecord;
  save(entity: VehicleRecord): Promise<VehicleRecord>;
  merge(
    entity: VehicleRecord,
    entityLike: DeepPartial<VehicleRecord>,
  ): VehicleRecord;
  findActiveById(id: string): Promise<VehicleRecord | null>;
  findByPlateNumber(plateNumber: string): Promise<VehicleRecord | null>;
  getNextVehicleRecordId(): Promise<number>;
}
