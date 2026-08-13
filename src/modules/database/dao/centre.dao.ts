import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../common/interfaces/pagination.interface';
import {
  buildTypeOrmPaginationOptions,
  toPaginatedResult,
} from '../../../common/shared/pagination/pagination-query.util';
import { PaginationService } from '../../../common/shared/pagination/pagination.service';
import { ICentreDao } from '../../masters/centres/dao/centre.dao.interface';
import { Centre } from '../entity/centre.entity';

@Injectable()
export class CentreDao extends Repository<Centre> implements ICentreDao {
  constructor(
    private readonly dataSource: DataSource,
    private readonly paginationService: PaginationService,
  ) {
    super(Centre, dataSource.createEntityManager());
  }

  async findActiveById(id: string): Promise<Centre | null> {
    return this.findOne({ where: { id, is_deleted: false } });
  }

  async findByCode(code: string): Promise<Centre | null> {
    return this.findOne({ where: { code, is_deleted: false } });
  }

  /** Case-insensitive name lookup (for duplicate-name prevention). */
  async findByName(name: string): Promise<Centre | null> {
    return this.createQueryBuilder('centre')
      .where('LOWER(centre.centre_name) = LOWER(:name)', { name: name.trim() })
      .andWhere('centre.is_deleted = :isDeleted', { isDeleted: false })
      .getOne();
  }

  async findByCentreId(centreId: number): Promise<Centre | null> {
    return this.findOne({ where: { centre_id: centreId, is_deleted: false } });
  }

  /**
   * Case-insensitive lookup by the appointment provider's branch code, so a
   * branch can only ever be linked to one centre.
   */
  async findByProviderBranchCode(branchCode: string): Promise<Centre | null> {
    return this.createQueryBuilder('centre')
      .where('UPPER(centre.provider_branch_code) = UPPER(:branchCode)', {
        branchCode: branchCode.trim(),
      })
      .andWhere('centre.is_deleted = :isDeleted', { isDeleted: false })
      .getOne();
  }

  /** Every centre linked to an appointment-provider branch. */
  async findAllWithProviderBranchCode(): Promise<Centre[]> {
    return this.createQueryBuilder('centre')
      .where('centre.provider_branch_code IS NOT NULL')
      .andWhere("TRIM(centre.provider_branch_code) <> ''")
      .andWhere('centre.is_deleted = :isDeleted', { isDeleted: false })
      .getMany();
  }

  async findPaginated(
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<Centre>> {
    const options = buildTypeOrmPaginationOptions<Centre, Centre>(query, {
      searchFields: ['centre_name', 'code', 'status'],
      allowedSortFields: [
        'centre_id',
        'centre_name',
        'code',
        'status',
        'created_at',
        'updated_at',
      ],
      defaultSort: { created_at: 'DESC' },
      baseWhere: { is_deleted: false },
    });

    const response = await this.paginationService.paginate(
      this,
      'centre',
      options,
    );
    return toPaginatedResult(response);
  }

  async getNextCentreId(): Promise<number> {
    const result = await this.createQueryBuilder('centre')
      .select('MAX(centre.centre_id)', 'max')
      .getRawOne();
    const max = result?.max ? Number(result.max) : 0;
    return max + 1;
  }
}
