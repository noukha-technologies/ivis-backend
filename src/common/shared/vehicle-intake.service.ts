// import { Injectable } from '@nestjs/common';
// import type { UserContext } from '../../../common/dto/auth.dto';
// import { getCreatedById } from '../../../common/utils/created-by.util';
// import { generateSnowflakeId } from '../../../common/shared/snowflakeIdGeneration';
// import { RopVerificationDao } from '../../database/dao/rop-verification.dao';
// import { VehicleRecordDao } from '../../database/dao/vehicle-record.dao';
// import { AnprCapture } from '../../database/entity/anpr-capture.entity';
// import { RopVerification } from '../../database/entity/rop-verification.entity';
// import { VehicleRecord } from '../../database/entity/vehicle-record.entity';

// @Injectable()
// export class VehicleIntakeService {
//   constructor(
//     private readonly ropVerificationDao: RopVerificationDao,
//     private readonly vehicleRecordDao: VehicleRecordDao,
//   ) {}

//   async simulateRopForCapture(capture: AnprCapture, actor: UserContext): Promise<RopVerification> {
//     const ropVerificationId = await this.ropVerificationDao.getNextRopVerificationId();

//     const rop = this.ropVerificationDao.create({
//       id: generateSnowflakeId(),
//       rop_verification_id: ropVerificationId,
//       anpr_capture_id: capture.id,
//       owner_name: 'Ahmed Al-Said',
//       vehicle_make: 'Toyota',
//       vehicle_model: 'Corolla',
//       reg_no: capture.plate_number,
//       chassis_no: 'JT2BF22K0W0123456',
//       insurance: 'Valid',
//       reg_expiry: new Date('2026-12-31'),
//       fetch_status: 'Fetched',
//       created_by: getCreatedById(actor),
//     });

//     const saved = await this.ropVerificationDao.save(rop);
//     await this.upsertVehicleRecordFromRop(saved, capture, actor);
//     return saved;
//   }

//   async upsertVehicleRecordFromRop(
//     rop: RopVerification,
//     capture: AnprCapture | undefined,
//     actor: UserContext,
//   ): Promise<VehicleRecord> {
//     const plateNumber = rop.reg_no || capture?.plate_number;
//     if (!plateNumber) {
//       throw new Error('Plate number is required to upsert vehicle record');
//     }

//     let record = await this.vehicleRecordDao.findByPlateNumber(plateNumber.trim());

//     if (record) {
//       record = this.vehicleRecordDao.merge(record, {
//         chassis_no: rop.chassis_no ?? record.chassis_no,
//         vehicle_make: rop.vehicle_make ?? record.vehicle_make,
//         vehicle_model: rop.vehicle_model ?? record.vehicle_model,
//         vehicle_type: capture?.vehicle_type ?? record.vehicle_type,
//         plate_color: capture?.plate_color ?? record.plate_color,
//         vehicle_color: capture?.vehicle_color ?? record.vehicle_color,
//       });
//       return this.vehicleRecordDao.save(record);
//     }

//     const vehicleRecordId = await this.vehicleRecordDao.getNextVehicleRecordId();
//     const created = this.vehicleRecordDao.create({
//       id: generateSnowflakeId(),
//       vehicle_record_id: vehicleRecordId,
//       plate_number: plateNumber.trim(),
//       chassis_no: rop.chassis_no,
//       vehicle_make: rop.vehicle_make,
//       vehicle_model: rop.vehicle_model,
//       vehicle_type: capture?.vehicle_type ?? 'Sedan',
//       plate_color: capture?.plate_color,
//       vehicle_color: capture?.vehicle_color,
//       created_by: getCreatedById(actor),
//     });

//     return this.vehicleRecordDao.save(created);
//   }

//   async findLatestRopByCaptureId(anprCaptureId: string): Promise<RopVerification | null> {
//     return this.ropVerificationDao.findOne({
//       where: { anpr_capture_id: anprCaptureId, is_deleted: false },
//       order: { created_at: 'DESC' },
//     });
//   }
// }
