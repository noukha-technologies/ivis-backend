import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { IVehicleRecordDao } from './vehicle-record.dao.interface';
import { VehicleRecord } from '../entity/vehicle-record.entity';

@Injectable()
export class VehicleRecordDao
  extends Repository<VehicleRecord>
  implements IVehicleRecordDao
{
  constructor(private readonly dataSource: DataSource) {
    super(VehicleRecord, dataSource.createEntityManager());
  }

  async findActiveById(id: string): Promise<VehicleRecord | null> {
    return this.findOne({
      where: { id, is_deleted: false },
      relations: { vehicleMaster: true },
    });
  }

  async findByPlateNumber(plateNumber: string): Promise<VehicleRecord | null> {
    return this.findOne({
      where: { plate_number: plateNumber, is_deleted: false },
      relations: { vehicleMaster: true },
    });
  }

  async getNextVehicleRecordId(): Promise<number> {
    const result = await this.createQueryBuilder('record')
      .select('MAX(record.vehicle_record_id)', 'max')
      .getRawOne();
    const max = result?.max ? Number(result.max) : 0;
    return max + 1;
  }
}
