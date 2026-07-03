import { DeepPartial } from 'typeorm';
import { PaginationQueryDto } from '../../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../../common/interfaces/pagination.interface';
import { AnprCapture } from '../../../database/entity/anpr-capture.entity';

export interface IAnprCaptureDao {
  create(entityLike: DeepPartial<AnprCapture>): AnprCapture;
  save(entity: AnprCapture): Promise<AnprCapture>;
  merge(entity: AnprCapture, entityLike: DeepPartial<AnprCapture>): AnprCapture;
  findActiveById(id: string): Promise<AnprCapture | null>;
  findByCaptureId(captureId: number): Promise<AnprCapture | null>;
  findLatestByPlate(plateNumber: string): Promise<AnprCapture | null>;
  findPaginated(
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<AnprCapture>>;
  getNextCaptureId(): Promise<number>;
}
