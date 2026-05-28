import { DeepPartial } from 'typeorm';
import { PaginationQueryDto } from '../../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../../common/interfaces/pagination.interface';
import { RopVerification } from '../../../database/entity/rop-verification.entity';

export interface IRopVerificationDao {
  create(entityLike: DeepPartial<RopVerification>): RopVerification;
  save(entity: RopVerification): Promise<RopVerification>;
  merge(entity: RopVerification, entityLike: DeepPartial<RopVerification>): RopVerification;
  findActiveById(id: string): Promise<RopVerification | null>;
  findByRopVerificationId(ropVerificationId: number): Promise<RopVerification | null>;
  findPaginated(query: PaginationQueryDto): Promise<PaginatedResult<RopVerification>>;
  getNextRopVerificationId(): Promise<number>;
}

