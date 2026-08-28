import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

import { RopVerification } from '../entity/rop-verification.entity';
import { RopVerificationStatus } from '../../../common/enums/common.enums';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../common/interfaces/pagination.interface';
import { IRopVerificationDao } from '../../transactions/rop-verifications/dao/rop-verification.dao.interface';
import {
  buildTypeOrmPaginationOptions,
  toPaginatedResult,
} from '../../../common/shared/pagination/pagination-query.util';

import { PaginationService } from '../../../common/shared/pagination/pagination.service';
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

  /**
   * The most recent verification for a plate.
   *
   * `within` restricts it to one Oman day, for the reuse path: registration and
   * ownership do not change during a visit, so a second capture of the same car
   * an hour later should reuse the row rather than re-query ROP. Across days it
   * must NOT — a vehicle returning next week is a new visit, and answering it
   * with last week's record would carry a stale insurance date and a stale
   * expiry into a fresh inspection.
   *
   * Called without a window it is an unrestricted "do we hold anything for this
   * plate" read, used where any prior record is useful context.
   */
  async findLatestByRegNo(
    regNo: string,
    within?: { start: Date; end: Date },
  ): Promise<RopVerification | null> {
    const qb = this.createQueryBuilder('rop')
      .where('rop.is_deleted = false')
      .andWhere('rop.reg_no = :regNo', { regNo });

    if (within) {
      qb.andWhere('rop.created_at >= :start', { start: within.start }).andWhere(
        'rop.created_at < :end',
        { end: within.end },
      );
    }

    return qb.orderBy('rop.created_at', 'DESC').getOne();
  }

  /**
   * Failed verifications raised within the given window, oldest first.
   *
   * Bounded to a day because a failure is only worth retrying while the
   * vehicle is plausibly still on site — retrying last week's plate forever
   * would hammer ROP for a car that left long ago.
   */
  async findFailedWithin(within: {
    start: Date;
    end: Date;
  }): Promise<RopVerification[]> {
    return this.createQueryBuilder('rop')
      .where('rop.is_deleted = false')
      .andWhere('rop.fetch_status = :status', {
        status: RopVerificationStatus.FAILED,
      })
      .andWhere('rop.created_at >= :start', { start: within.start })
      .andWhere('rop.created_at < :end', { end: within.end })
      .orderBy('rop.created_at', 'ASC')
      .getMany();
  }

  async findPaginated(
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<RopVerification>> {
    const options = buildTypeOrmPaginationOptions<
      RopVerification,
      RopVerification
    >(query, {
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
    });

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
