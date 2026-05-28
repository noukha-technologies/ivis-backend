import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../common/interfaces/pagination.interface';
import {
  buildTypeOrmPaginationOptions,
  toPaginatedResult,
} from '../../../common/shared/pagination/pagination-query.util';
import { PaginationService } from '../../../common/shared/pagination/pagination.service';
import { IRopVerificationDao } from '../../transactions/rop-verifications/dao/rop-verification.dao.interface';
import { RopVerification } from '../entity/rop-verification.entity';

@Injectable()
export class RopVerificationDao
  extends Repository<RopVerification>
  implements IRopVerificationDao
{
  constructor(
    private readonly dataSource: DataSource,
    private readonly paginationService: PaginationService,
  ) {
    super(RopVerification, dataSource.createEntityManager());
  }

  async findActiveById(id: string): Promise<RopVerification | null> {
    return this.findOne({
      where: { id, is_deleted: false },
      relations: { anpr_capture: { camera: true } },
    });
  }

  async findByRopVerificationId(
    ropVerificationId: number,
  ): Promise<RopVerification | null> {
    return this.findOne({
      where: { rop_verification_id: ropVerificationId, is_deleted: false },
    });
  }

  async findPaginated(
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<RopVerification>> {
    const options = buildTypeOrmPaginationOptions<RopVerification, RopVerification>(
      query,
      {
        searchFields: [
          'owner_name',
          'vehicle_make',
          'vehicle_model',
          'reg_no',
          'chassis_no',
          'insurance',
          'fetch_status',
        ],
        allowedSortFields: [
          'rop_verification_id',
          'owner_name',
          'reg_no',
          'reg_expiry',
          'fetch_status',
          'created_at',
          'updated_at',
        ],
        defaultSort: { created_at: 'DESC' },
        baseWhere: { is_deleted: false },
      },
    );

    const response = await this.paginationService.paginate(
      this,
      'ropVerification',
      options,
    );
    return toPaginatedResult(response);
  }

  async getNextRopVerificationId(): Promise<number> {
    const result = await this.createQueryBuilder('rop')
      .select('MAX(rop.rop_verification_id)', 'max')
      .getRawOne();
    const max = result?.max ? Number(result.max) : 0;
    return max + 1;
  }
}

